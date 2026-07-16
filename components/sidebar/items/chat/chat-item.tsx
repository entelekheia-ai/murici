/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { cn } from "@/lib/utils"
import { useChannelStore, isChannelBusy } from "@/lib/store/channel-store"
import { Tables } from "@/types/database"
import { Loader2 } from "lucide-react"
import { FC, useRef } from "react"

interface ChatItemProps {
  chat: Tables<"chats">
  isActive: boolean
  onClick: () => void
  actions?: React.ReactNode
}

export const ChatItem: FC<ChatItemProps> = ({
  chat,
  isActive,
  onClick,
  actions
}) => {
  const itemRef = useRef<HTMLDivElement>(null)

  // Is this chat still producing a reply? Read straight from the channel store —
  // no prop threading through Sidebar -> SidebarContent -> SidebarDataList.
  //
  // This is the affordance that makes background generation visible. Starting a new
  // chat no longer aborts the one you were in (ADR-0007): it keeps streaming in its
  // own channel and its reply lands in it. Without this spinner that work would be
  // invisible, so the user would have no way to tell a chat is still working.
  const isGenerating = useChannelStore(s => isChannelBusy(s.channels[chat.id]))

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      e.stopPropagation()
      itemRef.current?.click()
    }
  }

  return (
    <div
      ref={itemRef}
      className={cn(
        "group flex h-[37px] w-full cursor-pointer items-center rounded-lg px-2 py-1 transition-colors focus:outline-none",
        isActive
          ? "bg-background-secondary text-foreground-primary"
          : "text-foreground-secondary-80 hover:bg-background-secondary/40"
      )}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={onClick}
    >
      <div
        className={cn(
          "flex-1 truncate text-sm",
          isActive ? "font-semibold" : "font-normal"
        )}
      >
        {chat.name}
      </div>

      {isGenerating && (
        <Loader2
          size={14}
          aria-label="Gerando resposta"
          data-generating="true"
          className="ml-2 shrink-0 animate-spin text-foreground-secondary"
        />
      )}

      {actions && (
        <div
          onClick={e => {
            e.stopPropagation()
            e.preventDefault()
          }}
          className="ml-2 flex space-x-2 opacity-0 group-hover:opacity-100"
        >
          {actions}
        </div>
      )}
    </div>
  )
}
