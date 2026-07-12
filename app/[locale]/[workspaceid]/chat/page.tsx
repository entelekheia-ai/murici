"use client"
/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import { useChatHandler } from "@/lib/hooks/use-chat-handler"
import { ChatInput } from "@/components/chat/chat-input"
import { Header } from "@/components/chat/header"
import { ChatUI } from "@/components/chat/chat-ui"
import { BrandLogo } from "@/components/ui/brand-logo"
import { ChatbotUIContext } from "@/context/context"
import useHotkey from "@/lib/hooks/use-hotkey"
import { useTheme } from "next-themes"
import { useContext, useEffect, useState } from "react"
import { KnowledgeHomeView } from "@/components/knowledge/knowledge-home-view"
import { useKnowledgeData } from "@/lib/hooks/use-knowledge-data"
import { useHeaderControls } from "@/lib/hooks/use-header-controls"

export default function ChatPage() {
  useHotkey("o", () => handleNewChat())
  useHotkey("l", () => {
    handleFocusChatInput()
  })

  const { chatMessages, showSidebar, setShowSidebar, setShowRightSidebar, chats } = useContext(ChatbotUIContext)

  const { knowledge, agentBundles, loading: knowledgeLoading } = useKnowledgeData()
  const headerProps = useHeaderControls()
  const [showGraphHome, setShowGraphHome] = useState(true)

  useEffect(() => {
    if (chatMessages.length === 0 && showGraphHome) {
      setShowSidebar(false)
      setShowRightSidebar(false)
    }
  }, [chatMessages.length, showGraphHome, setShowSidebar, setShowRightSidebar])

  const { handleNewChat, handleFocusChatInput } = useChatHandler()

  const { theme } = useTheme()

  return (
    <>
      {chatMessages.length === 0 && showGraphHome ? (
        <div className="relative flex size-full flex-col items-center">
          <KnowledgeHomeView
            knowledge={knowledge}
            chats={chats}
            agentBundles={agentBundles}
            loading={knowledgeLoading}
          />
          <div 
            onClickCapture={() => {
              if (showGraphHome) {
                setShowGraphHome(false)
                setShowSidebar(true)
                setTimeout(() => {
                  handleFocusChatInput()
                }, 50)
              }
            }}
            className="absolute bottom-0 z-50 w-full items-end p-[24px]"
          >
            <ChatInput />
          </div>
        </div>
      ) : chatMessages.length === 0 && !showGraphHome ? (
        <div className="relative flex h-full flex-col items-center">
          <Header {...headerProps} />
          <div className="flex grow flex-col items-center justify-center">
            <div className="mb-20">
              <BrandLogo showIcon className="scale-150" />
            </div>
          </div>
          <div className="w-full items-end p-[24px]">
            <ChatInput />
          </div>
        </div>
      ) : (
        <ChatUI />
      )}
    </>
  )
}
