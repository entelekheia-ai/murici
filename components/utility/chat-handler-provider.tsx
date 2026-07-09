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
import { useRouter } from "next/navigation"
import { FC, useContext, useEffect, useRef } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { executeClientTool } from "@/lib/tools/orchestrator"
import { useDebugSync } from "@/lib/hooks/use-debug"
import { LLM_LIST } from "@/lib/models/llm/llm-list"
import { getMessageText } from "@/lib/ai/ui-message-parts"
import { resolveCustomModel } from "@/lib/models/resolve-custom-model"
import { buildStreamingAssistantMessage } from "@/lib/chat/build-streaming-message"
import { logger } from "@/lib/logger"
import { toast } from "sonner"

interface ChatHandlerProviderProps {
  children: React.ReactNode
}

// Single owner of the app's useChat() instance and its lifecycle (send,
// stream-sync, persist-on-finish, stop, new chat). Mounted once near the app
// root so every component that used to call useChatHandler() directly (9 of
// them: sidebar, chat-input, message, chat-messages, etc.) now reads the same
// instance through context instead of each mounting its own — see
// context/chat-handler-context.tsx for why that duplication was the actual
// root cause of replies/edits going missing from the UI.
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
  // component), a per-instance ref is enough to guard re-entrancy — no need
  // for the module-level lock this used to require.
  const isSendingRef = useRef(false)

  // Sync ref
  useEffect(() => {
    chatMessagesRef.current = context.chatMessages
    logger.debug("chatMessages changed", {
      entries: context.chatMessages.map(m => ({
        id: m.message.id,
        role: m.message.role,
        seq: m.message.sequence_number,
        contentLen: m.message.content?.length ?? -1
      }))
    })
  }, [context.chatMessages])

  const {
    messages: vercelMessages,
    sendMessage: append,
    regenerate: reload,
    stop,
    status,
    setMessages
  } = useChat({
    transport: new DefaultChatTransport({ api: `/api/chat/${currentProvider}` }),
    id: context.selectedChat?.id || "__new__",
    async onToolCall({ toolCall }) {
      if (!context.flowState || !context.selectedChat) return

      return await executeClientTool(toolCall as any, {
        chatId: context.selectedChat?.id || "__new__",
        messageId: toolCall.toolCallId,
        promptMessageId: "",
        behaviorState: context.flowState || undefined
      })
    },
    // The AI SDK calls this with { message, messages, isAbort, isDisconnect,
    // isError, finishReason } — NOT the message itself (ChatOnFinishCallback
    // in node_modules/ai/dist/index.d.ts). Destructuring `message` out of it
    // is required: passing the whole wrapper through as if it were the
    // message means `.role` is undefined and `.parts` doesn't exist, so the
    // real streamed reply (correctly shown by the effect below while
    // streaming) gets immediately overwritten with an empty/roleless row the
    // instant the stream finishes — this was the actual cause of "the model
    // replies but it never reaches the UI".
    async onFinish({ message }: { message: any }) {
      logger.debug("useChat onFinish fired", {
        hasSelectedChat: !!context.selectedChat,
        role: message?.role,
        text: getMessageText(message)
      })
      if (!context.selectedChat) return
      // Persist the final message to the database
      const seqNum = chatMessagesRef.current.length > 0
        ? chatMessagesRef.current[chatMessagesRef.current.length - 1].message.sequence_number + 1
        : 1

      const savedMsgs = await createMessages([{
        chat_id: context.selectedChat.id,
        content: getMessageText(message),
        role: message.role as any,
        model: context.chatSettings?.model || "custom",
        user_id: context.profile!.id,
        sequence_number: seqNum
      }])

      context.setChatMessages(prev => {
        // Remove the temporary streaming message if it exists
        const filtered = prev.filter(p => p.message.id !== "temp-assistant")
        return [...filtered, { message: savedMsgs[0], fileItems: [] }]
      })

      await updateChat(context.selectedChat.id, {
        updated_at: new Date().toISOString()
      })
    },
    onError(error) {
      logger.error("Vercel AI SDK onError", { error: error.message })
      // Previously silent: the input just went back to idle with no
      // response and no visible error, which is indistinguishable from the
      // reply simply never arriving — exactly the bug this surfaces.
      toast.error(`Failed to get a response: ${error.message}`)
      context.setIsGenerating(false)
      context.setChatMessages(prev => prev.filter(p => p.message.id !== "temp-assistant"))
    }
  })

  // Synchronize Vercel's real-time events to the visual debug layer
  useDebugSync(vercelMessages, status === 'streaming' || status === 'submitted')

  // Stream text into UI
  useEffect(() => {
    logger.debug("stream-sync effect fired", {
      status,
      vercelMessagesCount: vercelMessages.length,
      lastRole: vercelMessages[vercelMessages.length - 1]?.role
    })
    if (status !== 'streaming' && status !== 'submitted') return
    const lastVercelMessage = vercelMessages[vercelMessages.length - 1]
    if (!lastVercelMessage || lastVercelMessage.role !== 'assistant') return

    context.setChatMessages(prev => {
      const newArr = [...prev]
      const lastChatMsg = newArr[newArr.length - 1]

      const textContent = getMessageText(lastVercelMessage)

      if (lastChatMsg && lastChatMsg.message.id === "temp-assistant") {
        lastChatMsg.message.content = textContent
        return newArr
      } else {
        const seqNum = prev.length > 0 ? prev[prev.length - 1].message.sequence_number + 1 : 1
        return [...prev, {
          message: buildStreamingAssistantMessage({
            chatId: context.selectedChat?.id || "",
            content: textContent,
            sequenceNumber: seqNum
          }),
          fileItems: []
        }]
      }
    })
  }, [vercelMessages, status])

  const handleNewChat = async () => {
    if (!context.selectedWorkspace) return
    // Notifies AgentSessionProvider (a sibling, not a dependency of this
    // provider) to reset the "__new__" agent session — see newChatSignal's
    // doc comment in context/context.tsx for why this is a signal instead of
    // a direct call into AgentSessionContext.
    context.setNewChatSignal(n => n + 1)
    context.setSelectedAssistant(null)
    context.setUserInput("")
    context.setChatMessages([])
    setMessages([])
    context.setSelectedChat(null)
    context.setIsGenerating(false)
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
    logger.debug("handleSendMessage called", { messageContent, isSending: isSendingRef.current })
    if (isSendingRef.current || !messageContent.trim()) return
    isSendingRef.current = true

    try {
      context.setUserInput("")
      context.setIsGenerating(true)

      // 1. Initial Persist (User Message)
      let currentChat = context.selectedChat
      if (!currentChat) {
        currentChat = await createChat({
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

      const seqNum = chatMessagesRef.current.length > 0
        ? chatMessagesRef.current[chatMessagesRef.current.length - 1].message.sequence_number + 1
        : 1

      const userMsgs = await createMessages([{
        chat_id: currentChat.id,
        content: messageContent,
        role: "user",
        model: context.chatSettings?.model || "custom",
        user_id: context.profile!.id,
        sequence_number: seqNum
      }])

      logger.debug("user message persisted", { id: userMsgs[0].id, seqNum })
      context.setChatMessages(prev => [...prev, { message: userMsgs[0], fileItems: [] }])

      // 2. Fetch MCP Tools
      const mcpRes = await fetch("/api/mcp/tools")
      const mcpToolsData = mcpRes.ok ? await mcpRes.json() : []

      // 3. Append to Vercel AI SDK
      const customModel = resolveCustomModel(
        context.models,
        context.availableLocalModels,
        context.chatSettings?.model
      )

      append(
        { text: messageContent },
        {
          body: {
            chatSettings: context.chatSettings,
            customModel,
            // Tool objects (Zod schemas, closures) don't survive JSON — the
            // server builds the actual tool set from these raw ingredients
            // via lib/tools/registry.ts (see app/api/chat/*/route.ts).
            behaviorState: context.flowState || undefined,
            mcpTools: mcpToolsData
          }
        }
      )

    } catch (err: any) {
      logger.error("handleSendMessage failed", { error: err.message })
      context.setIsGenerating(false)
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
