"use client"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { ChatHandlerContext } from "@/context/chat-handler-context"
import { ChatbotUIContext } from "@/context/context"
import { updateChat, createChat } from "@/db/chats"
import { createMessages } from "@/db/messages"
import { ChatMessage } from "@/types"
import { Message } from "@/types/database"
import { useRouter } from "next/navigation"
import { FC, useContext, useEffect, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { executeClientTool } from "@/lib/tools/orchestrator"
import { useDebugSync } from "@/lib/hooks/use-debug"
import { LLM_LIST } from "@/lib/models/llm/llm-list"
import { getMessageText, getToolInvocations, getReasoningText } from "@/lib/ai/ui-message-parts"
import { resolveCustomModel } from "@/lib/models/resolve-custom-model"
import { logger } from "@/lib/logger"
import { toast } from "sonner"

interface ChatHandlerProviderProps {
  children: React.ReactNode
}

// Single owner of the app's one useChat() instance and its lifecycle.
//
// The AI SDK's useChat().messages is the ONE source of truth for message
// content. This provider does exactly two things with it and never mirrors
// state back into it token-by-token:
//   - loads persisted history into it once when a chat is opened (seed effect)
//   - projects it one-way into ChatbotUIContext.chatMessages so the ~10 existing
//     consumers (chat-messages, message, chat-input history, build-prompt, ...)
//     keep reading the DB-shaped list they already expect, without any of them
//     importing @ai-sdk/react.
//
// That one-directional flow (SDK -> chatMessages, DB only on open/finish) is
// what removed the earlier bidirectional-mirroring bugs: reasoning vanishing at
// stream end, the intermittent stuck-loading spinner, and the mid-stream id
// swap. See project/adr/0003 + its log for the full history.
export const ChatHandlerProvider: FC<ChatHandlerProviderProps> = ({
  children
}) => {
  const router = useRouter()
  const context = useContext(ChatbotUIContext)
  const builtInModel = LLM_LIST.find(
    m => m.modelId === context.chatSettings?.model
  )
  const currentProvider = builtInModel?.provider || "custom"
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const chatMessagesRef = useRef(context.chatMessages)

  // Now that useChat() is mounted exactly once (not once per consuming
  // component), a per-instance ref is enough to guard re-entrancy.
  const isSendingRef = useRef(false)

  // The useChat id is allocated on the client and stays stable for the life of
  // a chat: for an existing chat it's the DB id (adopted below on navigation),
  // for a brand-new chat it's a uuid we generate up front and then reuse as the
  // DB chat id on first send. It is never reassigned mid-stream, so the SDK's
  // per-id message store is never swapped out from under an in-flight response
  // — that swap was the cause of the "sometimes only the loading spinner
  // stays" symptom.
  const [activeChatId, setActiveChatId] = useState<string>(
    () => context.selectedChat?.id ?? crypto.randomUUID()
  )
  const pendingNewChatIdRef = useRef<string>(activeChatId)

  // MCP tools are fetched once up front and cached, so a send never blocks on a
  // network round trip before the user's own message can appear — that fetch
  // sitting on the critical path was the "long delay after Enter" symptom.
  const mcpToolsRef = useRef<any[]>([])

  useEffect(() => {
    chatMessagesRef.current = context.chatMessages
    logger.debug("chatMessages changed", {
      count: context.chatMessages.length,
      lastRole: context.chatMessages[context.chatMessages.length - 1]?.message.role,
      lastLen: context.chatMessages[context.chatMessages.length - 1]?.message.content?.length ?? -1
    })
  }, [context.chatMessages])

  useEffect(() => {
    let cancelled = false
    fetch("/api/mcp/tools")
      .then(r => (r.ok ? r.json() : []))
      .then(d => {
        if (!cancelled) mcpToolsRef.current = Array.isArray(d) ? d : []
      })
      .catch(err => logger.warn("MCP tools prefetch failed", { error: err?.message }))
    return () => {
      cancelled = true
    }
  }, [])

  const {
    messages: vercelMessages,
    sendMessage: append,
    stop,
    status,
    setMessages
  } = useChat({
    transport: new DefaultChatTransport({ api: `/api/chat/${currentProvider}` }),
    id: activeChatId,
    async onToolCall({ toolCall }) {
      if (!context.flowState || !context.selectedChat) return

      return await executeClientTool(
        toolCall as unknown as { toolCallId: string; toolName: string; args: any },
        {
          chatId: context.selectedChat?.id || activeChatId,
          messageId: toolCall.toolCallId,
          promptMessageId: "",
          behaviorState: context.flowState || undefined
        }
      )
    },
    // The AI SDK calls this with { message, messages, isAbort, ... } — NOT the
    // message itself (ChatOnFinishCallback in ai/dist/index.d.ts). We only
    // persist here; the projection effect already put the streamed reply on
    // screen, so this does NOT touch chatMessages (doing so is what used to
    // overwrite the visible reply with an empty row).
    async onFinish({ message }: { message: any }) {
      logger.debug("useChat onFinish fired", {
        hasSelectedChat: !!context.selectedChat,
        role: message?.role,
        textLen: getMessageText(message).length
      })
      if (!context.selectedChat) return

      // Persist under the SDK message's own id so the row the projection is
      // already showing (and its id-keyed reasoning in thinkingLog) stays
      // stable across the streaming -> persisted handoff.
      const projected = chatMessagesRef.current.find(
        c => c.message.id === message.id
      )
      const seqNum =
        projected?.message.sequence_number ??
        (chatMessagesRef.current.length > 0
          ? chatMessagesRef.current[chatMessagesRef.current.length - 1].message
              .sequence_number + 1
          : 1)

      await createMessages([
        {
          id: message.id,
          chat_id: context.selectedChat.id,
          content: getMessageText(message),
          role: message.role as "user" | "assistant" | "system" | "tool",
          model: context.chatSettings?.model || "custom",
          user_id: context.profile!.id,
          sequence_number: seqNum
        }
      ])

      await updateChat(context.selectedChat.id, {
        updated_at: new Date().toISOString()
      })
    },
    onError(error) {
      logger.error("Vercel AI SDK onError", { error: error.message })
      toast.error(`Failed to get a response: ${error.message}`)
      context.setIsGenerating(false)
      context.setFirstTokenReceived(false)
    }
  })

  const isStreaming = status === "streaming" || status === "submitted"

  // Navigation: adopt an opened chat's DB id as the useChat id, but never while
  // streaming (that would abort the in-flight response). New chats keep their
  // client-generated uuid — handleSendMessage persists the chat row under that
  // same id, so selectedChat.id === activeChatId and this stays a no-op during
  // a send.
  useEffect(() => {
    if (isStreaming) return
    const dbId = context.selectedChat?.id
    if (dbId && dbId !== activeChatId) setActiveChatId(dbId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.selectedChat?.id, status])

  // Seed useChat with persisted history exactly once per chat id (chat-ui loads
  // the DB rows into context.chatMessages when a chat is opened). The ref guard
  // keeps the projection's own writes from ever re-seeding.
  const seededIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (isStreaming) return
    if (seededIdRef.current === activeChatId) return
    seededIdRef.current = activeChatId
    setMessages(
      context.chatMessages.map(cm => ({
        id: cm.message.id,
        role: cm.message.role as "user" | "assistant" | "system",
        parts: [{ type: "text", text: cm.message.content }]
      })) as any
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId, status, context.chatMessages])

  // The single one-way projection: SDK messages -> DB-shaped chatMessages.
  // Existing rows are merged by id so created_at / sequence_number stay stable
  // (no timestamp churn, no key thrash) while new/streaming rows are filled in.
  useEffect(() => {
    if (vercelMessages.length === 0) return

    const prevById = new Map(
      chatMessagesRef.current.map(cm => [cm.message.id, cm])
    )
    const nextThinking: Record<string, string> = {}

    const projected: ChatMessage[] = vercelMessages.map((m, i) => {
      const prev = prevById.get(m.id)
      const content = getMessageText(m)
      const tools = getToolInvocations(m)
      const reasoning = getReasoningText(m)
      if (reasoning) nextThinking[m.id] = reasoning

      const message: Message = {
        id: m.id,
        chat_id: context.selectedChat?.id ?? activeChatId,
        user_id: prev?.message.user_id ?? "local",
        assistant_id: prev?.message.assistant_id ?? null,
        role: m.role as Message["role"],
        content,
        model: prev?.message.model ?? context.chatSettings?.model ?? "custom",
        sequence_number: prev?.message.sequence_number ?? i + 1,
        tool_calls: tools,
        tool_call_id: prev?.message.tool_call_id,
        image_paths: prev?.message.image_paths ?? [],
        created_at: prev?.message.created_at ?? new Date().toISOString(),
        updated_at: prev?.message.updated_at ?? null
      }
      return { message, fileItems: prev?.fileItems ?? [] }
    })

    context.setChatMessages(projected)

    if (Object.keys(nextThinking).length > 0) {
      context.setThinkingLog(prev => ({ ...prev, ...nextThinking }))
    }

    const last = vercelMessages[vercelMessages.length - 1]
    if (
      !context.firstTokenReceived &&
      last?.role === "assistant" &&
      (getMessageText(last).length > 0 ||
        getToolInvocations(last).length > 0 ||
        getReasoningText(last).length > 0)
    ) {
      context.setFirstTokenReceived(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vercelMessages])

  // Keep the app-wide isGenerating flag in lockstep with the SDK stream status
  // so the send/stop button and spinners settle when a turn ends. The SDK owns
  // the real lifecycle; nothing reliably cleared this on a successful finish
  // before (only on error). Depends on the streaming transition, not on
  // isGenerating, so it can't race the synchronous setIsGenerating(true) that
  // handleSendMessage does before the stream starts.
  useEffect(() => {
    if (!isStreaming && context.isGenerating) {
      context.setIsGenerating(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming])

  // Synchronize Vercel's real-time events to the visual debug layer
  useDebugSync(vercelMessages, isStreaming)

  const handleNewChat = async () => {
    if (!context.selectedWorkspace) return
    // Notifies AgentSessionProvider (a sibling, not a dependency of this
    // provider) to reset the "__new__" agent session — see newChatSignal's
    // doc comment in context/context.tsx.
    context.setNewChatSignal(n => n + 1)

    // Allocate the next chat's id up front so useChat mounts on a fresh, empty,
    // stable store — no null -> realId transition during the first send.
    const newId = crypto.randomUUID()
    pendingNewChatIdRef.current = newId
    seededIdRef.current = newId // an empty new chat needs no DB seed
    setActiveChatId(newId)
    setMessages([])

    context.setSelectedAssistant(null)
    context.setUserInput("")
    context.setChatMessages([])
    context.setSelectedChat(null)
    context.setIsGenerating(false)
    context.setFirstTokenReceived(false)
    router.push(`/${context.selectedWorkspace.id}/chat`)
  }

  const handleFocusChatInput = () => {
    chatInputRef.current?.focus()
  }
  const handleStopMessage = () => stop()
  const handleSendEdit = async () => {}

  const handleSendMessage = async (
    messageContent: string,
    chatMessages: ChatMessage[],
    isRegeneration: boolean
  ) => {
    logger.debug("handleSendMessage called", {
      len: messageContent.length,
      isSending: isSendingRef.current,
      isRegeneration
    })
    if (isSendingRef.current || !messageContent.trim()) return
    isSendingRef.current = true

    try {
      context.setUserInput("")
      context.setIsGenerating(true)
      context.setFirstTokenReceived(false)

      // Ensure a chat row exists — created under activeChatId so the useChat id
      // never has to change.
      let currentChat = context.selectedChat
      if (!currentChat) {
        currentChat = await createChat({
          id: pendingNewChatIdRef.current,
          workspace_id: context.selectedWorkspace!.id,
          user_id: context.profile!.id,
          name: messageContent.substring(0, 50),
          model: context.chatSettings?.model || "custom",
          prompt: context.chatSettings?.prompt || "",
          temperature: context.chatSettings?.temperature || 0.5,
          context_length: context.chatSettings?.contextLength || 4000,
          embeddings_provider: "openai"
        })
        context.setSelectedChat(currentChat)
        context.setChats(prev => [currentChat!, ...prev])
      }

      // Persist the user turn for durability (the visible bubble comes from the
      // projection once append() adds it to the SDK store).
      const seqNum =
        chatMessagesRef.current.length > 0
          ? chatMessagesRef.current[chatMessagesRef.current.length - 1].message
              .sequence_number + 1
          : 1

      await createMessages([
        {
          chat_id: currentChat.id,
          content: messageContent,
          role: "user",
          model: context.chatSettings?.model || "custom",
          user_id: context.profile!.id,
          sequence_number: seqNum
        }
      ])

      const customModel = resolveCustomModel(
        context.models,
        context.availableLocalModels,
        context.chatSettings?.model
      )

      // vercelMessages already holds the conversation (seeded on open,
      // accumulated during the session), so we don't re-inject history here.
      append(
        { text: messageContent },
        {
          body: {
            chatSettings: context.chatSettings,
            customModel,
            // Tool objects (Zod schemas, closures) don't survive JSON — the
            // server rebuilds the tool set from these raw ingredients via
            // lib/tools/registry.ts (see app/api/chat/*/route.ts).
            behaviorState: context.flowState || undefined,
            mcpTools: mcpToolsRef.current
          }
        }
      )
    } catch (err: any) {
      logger.error("handleSendMessage failed", { error: err.message })
      context.setIsGenerating(false)
      context.setFirstTokenReceived(false)
    } finally {
      isSendingRef.current = false
    }
  }

  return (
    <ChatHandlerContext.Provider
      value={{
        handleNewChat,
        handleSendMessage,
        handleFocusChatInput,
        handleStopMessage,
        handleSendEdit,
        chatInputRef
      }}
    >
      {children}
    </ChatHandlerContext.Provider>
  )
}
