/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { FC } from "react"
import { useTranslation } from "react-i18next"
import { ToggleTheme } from "../utility/toggle-theme"
import { IconSidebarToggle } from "../icons/chat-icons"
import { ButtonGhost } from "../ui/button-ghost"
import { Switch } from "../ui/switch"

interface HeaderProps {
  showSidebar: boolean
  showRightSidebar: boolean
  showDebugPanels: boolean
  onToggleSidebar: () => void
  onToggleRightSidebar: () => void
  onToggleDebugPanels: (checked: boolean) => void
}

export const Header: FC<HeaderProps> = ({
  showSidebar,
  showRightSidebar,
  showDebugPanels,
  onToggleSidebar,
  onToggleRightSidebar,
  onToggleDebugPanels
}) => {
  const { t } = useTranslation()

  // OS detection for macOS
  const isMac =
    typeof window !== "undefined" &&
    (window.electronAPI?.platform === "darwin" ||
      /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent))

  return (
    <div className="drag-region flex w-full h-[40px] min-w-[400px] items-center px-6 py-3 bg-background-app shrink-0 select-none">
      {/* Spacer (only mac && chats.ishidden) */}
      {isMac && !showSidebar && <div className="w-[77px] shrink-0" />}

      {/* Button to show chats (visible only when chats sidebar is hidden) */}
      {!showSidebar && (
        <div>
          <ButtonGhost
            size="16px"
            className="no-drag font-instrument text-foreground-secondary hover:text-foreground-primary"
            text={t("Conversas")}
            showRightIcon={false}
            leftIcon={
              <IconSidebarToggle
                side="left"
                type="open"
                size={16}
              />
            }
            onClick={onToggleSidebar}
          />
        </div>
      )}

      {/* Right container Frame: layoutGrow: 1, justify-end */}
      <div className="flex-1 flex items-center justify-end gap-4">
        {/* Debug Toggle Switch */}
        <div className="flex items-center gap-2 no-drag">
          <span className="text-foreground-secondary font-sans text-xs whitespace-nowrap select-none">
            {t("Show debug")}
          </span>
          <Switch
            checked={showDebugPanels}
            onCheckedChange={onToggleDebugPanels}
          />
        </div>

        {/* Theme Toggle */}
        <ToggleTheme className="no-drag" />

        {/* Details Toggle Button */}
        <ButtonGhost
          size="16px"
          className="no-drag font-instrument text-foreground-secondary hover:text-foreground-primary"
          text={t("Detalhes")}
          showLeftIcon={false}
          rightIcon={
            <IconSidebarToggle
              side="right"
              type={showRightSidebar ? "hide" : "open"}
              size={16}
            />
          }
          onClick={onToggleRightSidebar}
        />
      </div>
    </div>
  )
}
