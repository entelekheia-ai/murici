"use client"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { IconTrashFigma } from "@/components/icons/chat-icons"
import Image from "next/image"
import { FC } from "react"

interface AgentRowItemProps {
  name: string
  description?: string
  onClick: () => void
  onRemove?: () => void
}

// Shared row for the "Agentes" panel (Sistema + Recentes sections). Mirrors
// chat-item.tsx's color/hover/state classes so it reads as the same list
// idiom, but allows a second (description) line and a leading icon, which
// chat rows intentionally omit.
export const AgentRowItem: FC<AgentRowItemProps> = ({
  name,
  description,
  onClick,
  onRemove
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") onClick()
  }

  return (
    <div
      className="group flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 font-instrument text-foreground-secondary transition-colors hover:bg-accent/50 focus:outline-none"
      tabIndex={0}
      role="button"
      onKeyDown={handleKeyDown}
      onClick={onClick}
    >
      <Image
        src="/dot-agent-icon.png"
        alt=""
        width={20}
        height={20}
        className="shrink-0 opacity-80"
      />

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground-primary">
          {name}
        </div>
        {description && (
          <div className="truncate text-xs text-foreground-secondary">
            {description}
          </div>
        )}
      </div>

      {onRemove && (
        <div
          onClick={e => {
            e.stopPropagation()
            e.preventDefault()
            onRemove()
          }}
          className="ml-2 flex shrink-0 opacity-0 group-hover:opacity-100"
        >
          <IconTrashFigma
            className="text-[#a3a3a3] hover:opacity-50"
            size={14}
          />
        </div>
      )}
    </div>
  )
}
