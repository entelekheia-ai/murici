/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { FC, useContext } from "react"
import { useTranslation } from "react-i18next"
import { ChatbotUIContext } from "@/context/context"
import { ChatSettings } from "./chat-settings"
import { ToggleTheme } from "../utility/toggle-theme"
import { IconPanelLeftFigma, IconPanelRightFigma } from "../icons/chat-icons"
import { ButtonGhost } from "../ui/button-ghost"
import { Switch } from "../ui/switch"

interface ChatHeaderProps { }

export const ChatHeader: FC<ChatHeaderProps> = ({ }) => {
  const { t } = useTranslation()

  const {
    selectedChat,
    showSidebar,
    setShowSidebar,
    showRightSidebar,
    setShowRightSidebar,
    showDebugPanels,
    setShowDebugPanels
  } = useContext(ChatbotUIContext)

  return (
    <div className="drag-region flex w-full items-center justify-between px-[24px] pt-[36px] pb-[12px] border-b border-[#e5e3df] dark:border-[#262626] shrink-0 bg-[#f8f3ee] dark:bg-[#0f0f0f]">
      {/* Esquerda: Conversas button */}
      <div className="flex w-[240px] items-center justify-start no-drag">
        <ButtonGhost
          size="16px"
          text={t("Conversas")}
          showRightIcon={false}
          leftIcon={<IconPanelLeftFigma size={16} />}
          onClick={() => setShowSidebar(!showSidebar)}
        />
      </div>


      {/* Direita: Theme & Inspector */}
      <div className="flex items-center justify-end w-[240px] gap-4 no-drag">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground select-none text-xs whitespace-nowrap">
            {t("Show debug")}
          </span>
          <Switch
            checked={showDebugPanels}
            onCheckedChange={checked => {
              localStorage.setItem("showDebugPanels", String(checked))
              setShowDebugPanels(checked)
            }}
          />
        </div>

        <ToggleTheme />

        <ButtonGhost
          size="16px"
          text={t("Detalhes")}
          showLeftIcon={false}
          rightIcon={<IconPanelRightFigma size={16} />}
          onClick={() => setShowRightSidebar(!showRightSidebar)}
        />
      </div>
    </div>
  )
}
