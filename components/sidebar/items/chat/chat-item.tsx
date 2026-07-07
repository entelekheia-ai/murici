import { Bot } from "lucide-react"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { ModelIcon } from "@/components/models/model-icon"
import { WithTooltip } from "@/components/ui/with-tooltip"
import { ChatbotUIContext } from "@/context/context"
import { LLM_LIST } from "@/lib/models/llm/llm-list"
import { cn } from "@/lib/utils"
import { Tables } from "@/types/database"
import { LLM } from "@/types"

import Image from "next/image"
import { useParams, useRouter } from "next/navigation"
import { FC, useContext, useRef } from "react"
import { DeleteChat } from "./delete-chat"
import { UpdateChat } from "./update-chat"

interface ChatItemProps {
  chat: Tables<"chats">
}

export const ChatItem: FC<ChatItemProps> = ({ chat }) => {
  const {
    selectedWorkspace,
    selectedChat,
    availableLocalModels,
    assistantImages,
    availableOpenRouterModels
  } = useContext(ChatbotUIContext)

  const router = useRouter()
  const params = useParams()
  const isActive = params.chatid === chat.id || selectedChat?.id === chat.id

  const itemRef = useRef<HTMLDivElement>(null)

  const handleClick = () => {
    if (!selectedWorkspace) return
    return router.push(`/${selectedWorkspace.id}/chat/${chat.id}`)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      e.stopPropagation()
      itemRef.current?.click()
    }
  }

  const MODEL_DATA = [
    ...LLM_LIST,
    ...availableLocalModels,
    ...availableOpenRouterModels
  ].find(llm => llm.modelId === chat.model) as LLM

  const assistantImage = assistantImages.find(
    image => image.assistantId === chat.assistant_id
  )?.base64

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
      onClick={handleClick}
    >
      {/* No icon rendered next to chat name to match Figma design */}

      <div className={cn("flex-1 truncate text-sm", isActive ? "font-semibold" : "font-normal")}>
        {chat.name}
      </div>

      <div
        onClick={e => {
          e.stopPropagation()
          e.preventDefault()
        }}
        className="ml-2 flex space-x-2 opacity-0 group-hover:opacity-100"
      >
        <UpdateChat chat={chat} />

        <DeleteChat chat={chat} />
      </div>
    </div>
  )
}
