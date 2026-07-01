/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { FC, useContext } from "react"
import { ChatbotUIContext } from "@/context/context"
import { ChatSettings } from "./chat-settings"
import { ThemeSwitcher } from "../utility/theme-switcher"
import { IconPanelRightFigma } from "../icons/chat-icons"
import { Button } from "../ui/button"
import { IconInfoCircle } from "@tabler/icons-react"
import { WithTooltip } from "../ui/with-tooltip"

interface ChatHeaderProps {}

export const ChatHeader: FC<ChatHeaderProps> = ({}) => {
  const { selectedChat, showRightSidebar, setShowRightSidebar } = useContext(ChatbotUIContext)

  return (
    <div className="drag-region flex h-[124px] w-full items-center justify-between px-6 border-b border-sidebar-border/50 shrink-0">
      {/* Esquerda: 100x100 space for Chat Info or empty */}
      <div className="flex h-[100px] w-[100px] items-center justify-start">
        {selectedChat && (
          <div className="no-drag">
            <WithTooltip
            delayDuration={200}
            display={
              <div>
                <div className="text-xl font-bold">Chat Info</div>
                <div className="mx-auto mt-2 max-w-xs space-y-2 sm:max-w-sm md:max-w-md lg:max-w-lg">
                  <div>Model: {selectedChat.model}</div>
                  <div>Prompt: {selectedChat.prompt}</div>
                  <div>Temperature: {selectedChat.temperature}</div>
                  <div>Context Length: {selectedChat.context_length}</div>
                </div>
              </div>
            }
            trigger={
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:opacity-50">
                <IconInfoCircle size={24} />
              </Button>
            }
          />
          </div>
        )}
      </div>

      {/* Centro: Model Selector */}
      <div className="flex flex-1 items-center justify-center no-drag">
        <ChatSettings />
      </div>

      {/* Direita: Theme & Inspector */}
      <div className="flex items-center justify-end w-[100px] space-x-2 no-drag">
        <ThemeSwitcher />
        
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-muted-foreground hover:opacity-50"
          onClick={() => setShowRightSidebar(!showRightSidebar)}
        >
          <IconPanelRightFigma size={18} />
        </Button>
      </div>
    </div>
  )
}
