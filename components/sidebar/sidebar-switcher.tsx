"use client"
import { File, AlertCircle, MessageSquare, Brain, LayoutGrid } from "lucide-react"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { ContentType } from "@/types"

import Image from "next/image"
import { FC, useState, useContext } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTranslation } from "react-i18next"
import { WithTooltip } from "../ui/with-tooltip"
import { ProfileSettings } from "../utility/profile-settings"
import { Button } from "../ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "../ui/popover"
import { ChatbotUIContext } from "@/context/context"

export const SIDEBAR_ICON_SIZE = 22

const MENU_ITEMS: {
  type: ContentType
  icon: React.ElementType | null
  label: string
}[] = [
  { type: "files", icon: File, label: "Files" },
  { type: "agents", icon: null, label: "Agents" }
]

interface SidebarSwitcherProps {
  onContentTypeChange: (contentType: ContentType) => void
}

export const SidebarSwitcher: FC<SidebarSwitcherProps> = ({
  onContentTypeChange
}) => {
  const { t } = useTranslation()
  const { knowledge } = useContext(ChatbotUIContext)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isAgentOpen = searchParams.get("agent") === "true"
  const isKnowledgeOpen = searchParams.get("knowledge") === "true"
  const [menuOpen, setMenuOpen] = useState(false)

  const toggleAgentPanel = () => {
    const params = new URLSearchParams(searchParams.toString())
    if (isAgentOpen) {
      params.delete("agent")
    } else {
      params.set("agent", "true")
    }
    router.replace(`${pathname}?${params.toString()}`)
  }

  const toggleKnowledgePanel = () => {
    const params = new URLSearchParams(searchParams.toString())
    if (isKnowledgeOpen) {
      params.delete("knowledge")
    } else {
      params.set("knowledge", "true")
    }
    router.replace(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex items-center justify-between border-t px-3 py-2">
      {/* Chats — acesso direto */}
      <WithTooltip
        display={<div>Chats</div>}
        trigger={
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onContentTypeChange("chats")}
          >
            <MessageSquare size={SIDEBAR_ICON_SIZE} />
          </Button>
        }
      />

      {/* Agente — ícone dot-agent */}
      <WithTooltip
        display={<div>.agent / .flow Panel</div>}
        trigger={
          <Button
            variant={isAgentOpen ? "default" : "ghost"}
            size="icon"
            onClick={toggleAgentPanel}
          >
            <Image
              src="/dot-agent-icon.png"
              alt="Agent"
              width={SIDEBAR_ICON_SIZE}
              height={SIDEBAR_ICON_SIZE}
              className="opacity-80"
            />
          </Button>
        }
      />

      {/* Artefatos — painel de knowledge */}
      <WithTooltip
        display={<div>Artefatos da conversa</div>}
        trigger={
          <div className="relative">
            <Button
              variant={isKnowledgeOpen ? "default" : "ghost"}
              size="icon"
              onClick={toggleKnowledgePanel}
            >
              <Brain size={SIDEBAR_ICON_SIZE} />
            </Button>
            {!isKnowledgeOpen && knowledge.length > 0 && (
              <span className="bg-primary text-primary-foreground pointer-events-none absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full text-[10px] font-bold leading-none">
                {knowledge.length > 9 ? "9+" : knowledge.length}
              </span>
            )}
          </div>
        }
      />

      {/* Menu — abre lista de conteúdos + perfil */}
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon">
            <WithTooltip
              display={<div>Menu</div>}
              trigger={<LayoutGrid size={SIDEBAR_ICON_SIZE} />}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="end" className="w-52 p-2">
          <div className="grid grid-cols-2 gap-1">
            {MENU_ITEMS.map(({ type, icon: Icon, label }) => (
              <Button
                key={type}
                variant="ghost"
                className="justify-start text-sm"
                onClick={() => {
                  onContentTypeChange(type)
                  setMenuOpen(false)
                }}
              >
                {Icon ? (
                  <Icon size={16} className="mr-2 shrink-0" />
                ) : (
                  <Image
                    src="/dot-agent-icon.png"
                    alt=""
                    width={16}
                    height={16}
                    className="mr-2 shrink-0 opacity-80"
                  />
                )}
                {t(label)}
              </Button>
            ))}
          </div>

          <div className="mt-1 border-t pt-1">
            <ProfileSettings />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
