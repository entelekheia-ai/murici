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
    <div className="drag-region flex w-full items-center justify-between px-[24px] py-[12px] border-b border-[#e5e3df] dark:border-[#262626] shrink-0 bg-[#f8f3ee] dark:bg-[#0f0f0f]">
      {/* Esquerda: 100x100 space for Chat Info or empty */}
      <div className="flex w-[100px] items-center justify-start">
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
