/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { ChatbotUIContext } from "@/context/context"
import { deleteAssistant } from "@/db/assistants"
import { deleteChat } from "@/db/chats"
import { deleteFile } from "@/db/files"
import { deleteModel } from "@/db/models"
import { deleteFileFromStorage } from "@/db/storage/files"
import { Tables } from "@/types/database"
import { ContentType, DataItemType } from "@/types"
import { FC, useContext, useRef, useState } from "react"

interface SidebarDeleteItemProps {
  item: DataItemType
  contentType: ContentType
}

export const SidebarDeleteItem: FC<SidebarDeleteItemProps> = ({
  item,
  contentType
}) => {
  const {
    setChats,
    setFiles,
    setAssistants,
    setModels
  } = useContext(ChatbotUIContext)

  const buttonRef = useRef<HTMLButtonElement>(null)

  const [showDialog, setShowDialog] = useState(false)

  const deleteFunctions = {
    chats: async (chat: Tables<"chats">) => {
      await deleteChat(chat.id)
    },
    files: async (file: Tables<"files">) => {
      await deleteFileFromStorage(file.file_path)
      await deleteFile(file.id)
    },
    assistants: async (assistant: Tables<"assistants">) => {
      await deleteAssistant(assistant.id)
      setChats(prevState =>
        prevState.filter(chat => chat.assistant_id !== assistant.id)
      )
    },
    models: async (model: Tables<"models">) => {
      await deleteModel(model.id)
    }
  }

  const stateUpdateFunctions = {
    chats: setChats,
    files: setFiles,
    assistants: setAssistants,
    models: setModels
  }

  const handleDelete = async () => {
    const deleteFunction = deleteFunctions[contentType]
    const setStateFunction = stateUpdateFunctions[contentType]

    if (!deleteFunction || !setStateFunction) return

    await deleteFunction(item as any)

    setStateFunction((prevItems: any) =>
      prevItems.filter((prevItem: any) => prevItem.id !== item.id)
    )

    setShowDialog(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      e.stopPropagation()
      buttonRef.current?.click()
    }
  }

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogTrigger asChild>
        <Button className="text-red-500" variant="ghost">
          Delete
        </Button>
      </DialogTrigger>

      <DialogContent onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Delete {contentType.slice(0, -1)}</DialogTitle>

          <DialogDescription>
            Are you sure you want to delete {item.name}?
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowDialog(false)}>
            Cancel
          </Button>

          <Button ref={buttonRef} variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
