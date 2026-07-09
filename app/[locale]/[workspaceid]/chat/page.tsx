"use client"
/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import { ChatHelp } from "@/components/chat/chat-help"
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
import { KnowledgeRecord } from "@/types/knowledge"
import { AgentBundleRecord } from "@/lib/local-db/schema"
import { getAllKnowledgeRecords } from "@/lib/local-db/knowledge"
import { getAllAgentBundles } from "@/lib/local-db/agent-bundles"

export default function ChatPage() {
  useHotkey("o", () => handleNewChat())
  useHotkey("l", () => {
    handleFocusChatInput()
  })

  const { chatMessages, showSidebar, setShowSidebar, showRightSidebar, setShowRightSidebar, showDebugPanels, setShowDebugPanels, chats } = useContext(ChatbotUIContext)

  const [knowledge, setKnowledge] = useState<KnowledgeRecord[]>([])
  const [agentBundles, setAgentBundles] = useState<AgentBundleRecord[]>([])
  const [showGraphHome, setShowGraphHome] = useState(true)

  useEffect(() => {
    getAllKnowledgeRecords().then(setKnowledge)
    getAllAgentBundles().then(setAgentBundles)
  }, [])

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
        <div className="relative flex h-full w-full flex-col items-center">
          <KnowledgeHomeView
            knowledge={knowledge}
            chats={chats}
            agentBundles={agentBundles}
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
          <Header
            showSidebar={showSidebar}
            showRightSidebar={showRightSidebar}
            showDebugPanels={showDebugPanels}
            onToggleSidebar={() => setShowSidebar(!showSidebar)}
            onToggleRightSidebar={() => setShowRightSidebar(!showRightSidebar)}
            onToggleDebugPanels={checked => {
              localStorage.setItem("showDebugPanels", String(checked))
              setShowDebugPanels(checked)
            }}
          />
          <div className="flex grow flex-col items-center justify-center">
            <div className="mb-20">
              <BrandLogo showIcon className="scale-150" />
            </div>
          </div>
          <div className="w-full items-end p-[24px]">
            <ChatInput />
          </div>
          <div className="absolute bottom-2 right-2 hidden md:block lg:bottom-4 lg:right-4">
            <ChatHelp />
          </div>
        </div>
      ) : (
        <ChatUI />
      )}
    </>
  )
}
