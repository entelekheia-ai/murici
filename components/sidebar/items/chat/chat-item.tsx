/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { cn } from "@/lib/utils"
import { Tables } from "@/types/database"
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
        "group flex w-full cursor-pointer items-center h-[37px] rounded-lg px-2 py-1 focus:outline-none transition-colors",
        isActive
          ? "bg-background-secondary text-foreground-primary"
          : "text-foreground-secondary-80 hover:bg-background-secondary/40"
      )}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={onClick}
    >
      <div className={cn("flex-1 truncate text-sm", isActive ? "font-semibold" : "font-normal")}>
        {chat.name}
      </div>

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
