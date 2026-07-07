/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { ChatbotUIContext } from "@/context/context"
import { updateChat, createChat } from "@/db/chats"
import { createMessages } from "@/db/messages"
import { useAgentSession } from "@/lib/hooks/use-agent-session"
import { ChatMessage, ChatPayload, LLMID } from "@/types"
import { useRouter } from "next/navigation"
import { useContext, useEffect, useRef } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { executeClientTool } from "@/lib/tools/orchestrator"
import { useDebugSync } from "@/lib/hooks/use-debug"
import { LLM_LIST } from "@/lib/models/llm/llm-list"
import { getMessageText } from "@/lib/ai/ui-message-parts"
import { resolveCustomModel } from "@/lib/models/resolve-custom-model"
import { logger } from "@/lib/logger"

export const useChatHandler = () => {
  const router = useRouter()
  const context = useContext(ChatbotUIContext)
  const builtInModel = LLM_LIST.find(
    m => m.modelId === context.chatSettings?.model
  )
  const currentProvider = builtInModel?.provider || "custom"
  const { resetSession } = useAgentSession()
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const chatMessagesRef = useRef(context.chatMessages)

  // Sync ref
  useEffect(() => {
    chatMessagesRef.current = context.chatMessages
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
    async onFinish(message: any) {
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
      context.setIsGenerating(false)
      context.setChatMessages(prev => prev.filter(p => p.message.id !== "temp-assistant"))
    }
  })

  // Synchronize Vercel's real-time events to the visual debug layer
  useDebugSync(vercelMessages, status === 'streaming' || status === 'submitted')

  // Stream text into UI
  useEffect(() => {
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
          message: {
            id: "temp-assistant",
            chat_id: context.selectedChat?.id || "",
            role: "assistant",
            content: textContent,
            sequence_number: seqNum,
            created_at: new Date().toISOString(),
            model: "custom",
            user_id: "local"
          } as any,
          fileItems: []
        }]
      }
    })
  }, [vercelMessages, status])

  const handleNewChat = async () => {
    if (!context.selectedWorkspace) return
    resetSession("__new__")
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
    }
  }

  return {
    handleNewChat,
    handleSendMessage,
    handleFocusChatInput,
    handleStopMessage,
    handleSendEdit,
    chatInputRef
  }
}
