/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import Loading from "@/app/[locale]/loading"
import { useChatHandler } from "@/lib/hooks/use-chat-handler"
import { ChatbotUIContext } from "@/context/context"
import { getChatById } from "@/db/chats"
import { getMessagesByChatId } from "@/db/messages"
import { getKnowledgeByConversationId } from "@/lib/local-db/knowledge"
import useHotkey from "@/lib/hooks/use-hotkey"
import { LLMID } from "@/types"
import { useParams } from "next/navigation"
import { FC, useContext, useEffect, useState } from "react"
import { useScroll } from "./chat-hooks/use-scroll"
import { ChatInput } from "./chat-input"
import { ChatMessages } from "./chat-messages"
import { Header } from "./header"
import { useHeaderControls } from "@/lib/hooks/use-header-controls"

interface ChatUIProps {}

export const ChatUI: FC<ChatUIProps> = ({}) => {
  useHotkey("o", () => handleNewChat())

  const params = useParams()

  const {
    setChatMessages,
    selectedChat,
    setSelectedChat,
    setChatSettings,
    setChatImages,
    assistants,
    setSelectedAssistant,
    setChatFileItems,
    setChatFiles,
    setUseRetrieval,
    setKnowledge,
    backgroundQueue
  } = useContext(ChatbotUIContext)

  const headerProps = useHeaderControls()
  const { handleNewChat, handleFocusChatInput } = useChatHandler()

  const {
    messagesStartRef,
    messagesEndRef,
    handleScroll,
    scrollToBottom,
    setIsAtBottom,
    isAtTop,
    isAtBottom,
    isOverflowing,
    scrollToTop
  } = useScroll()

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      await fetchMessages()
      await fetchChat()

      scrollToBottom()
      setIsAtBottom(true)
    }

    if (params.chatid) {
      fetchData().then(() => {
        handleFocusChatInput()
        setLoading(false)
      })
    } else {
      setLoading(false)
    }
  }, [])

  const fetchMessages = async () => {
    const chatId = params.chatid as string
    const fetchedMessages = await getMessagesByChatId(chatId)
    setChatImages([])
    setChatFileItems([])
    setChatFiles([])

    const fetchedChatMessages = fetchedMessages.map(message => ({
      message,
      fileItems: []
    }))

    setChatMessages(fetchedChatMessages)

    const knowledgeNodes = await getKnowledgeByConversationId(chatId)
    setKnowledge(knowledgeNodes)
  }

  const fetchChat = async () => {
    const chat = await getChatById(params.chatid as string)
    if (!chat) return

    if (chat.assistant_id) {
      const assistant = assistants.find(
        assistant => assistant.id === chat.assistant_id
      )

      if (assistant) {
        setSelectedAssistant(assistant)
      }
    }

    setSelectedChat(chat)
    const savedModel = localStorage.getItem("murici_selected_model")
    setChatSettings({
      model: (savedModel || chat.model) as LLMID | string,
      prompt: chat.prompt,
      temperature: chat.temperature,
      contextLength: chat.context_length,
      includeProfileContext: chat.include_profile_context,
      includeWorkspaceInstructions: chat.include_workspace_instructions,
      embeddingsProvider: chat.embeddings_provider as "openai" | "local"
    })
  }

  if (loading) {
    return <Loading />
  }

  return (
    <div className="relative flex h-full flex-col items-center bg-background-app">
      <Header {...headerProps} />

      <div
        className="flex size-full flex-col overflow-auto"
        onScroll={handleScroll}
      >
        <div ref={messagesStartRef} />

        <ChatMessages />

        <div ref={messagesEndRef} />
      </div>

      <div className="relative w-full items-end p-[24px]">
        <ChatInput />
        {backgroundQueue && backgroundQueue.length > 0 && (
          <div className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 items-center space-x-1.5 text-xs text-muted-foreground opacity-80 sm:bottom-2">
            <span className="animate-pulse">🧠</span>
            <span>Processando {backgroundQueue.length} tarefa{backgroundQueue.length > 1 ? "s" : ""} em segundo plano...</span>
          </div>
        )}
      </div>
    </div>
  )
}
