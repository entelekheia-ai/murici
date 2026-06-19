/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

// @ts-nocheck
import { useTranslation } from "react-i18next"
import { useChatHandler } from "@/components/chat/chat-hooks/use-chat-handler"
import { ChatbotUIContext } from "@/context/context"
import { createFolder } from "@/db/folders"
import { ContentType } from "@/types"
import { IconFolderPlus, IconPlus } from "@tabler/icons-react"
import { FC, useContext, useState } from "react"
import { Button } from "../ui/button"
import { CreateAssistant } from "./items/assistants/create-assistant"
import { CreateFile } from "./items/files/create-file"
import { CreateModel } from "./items/models/create-model"

interface SidebarCreateButtonsProps {
  contentType: ContentType
  hasData: boolean
}

export const SidebarCreateButtons: FC<SidebarCreateButtonsProps> = ({
  contentType,
  hasData
}) => {
  const { t } = useTranslation()
  const { profile, selectedWorkspace, folders, setFolders } =
    useContext(ChatbotUIContext)
  const { handleNewChat } = useChatHandler()

  const [isCreatingFile, setIsCreatingFile] = useState(false)
  const [isCreatingAssistant, setIsCreatingAssistant] = useState(false)
  const [isCreatingModel, setIsCreatingModel] = useState(false)

  const handleCreateFolder = async () => {
    if (!profile) return
    if (!selectedWorkspace) return

    const createdFolder = await createFolder({
      user_id: profile.user_id,
      workspace_id: selectedWorkspace.id,
      name: "New Folder",
      description: "",
      type: contentType
    })
    setFolders([...folders, createdFolder])
  }

  const getCreateFunction = () => {
    switch (contentType) {
      case "chats":
        return async () => {
          handleNewChat()
        }

      case "files":
        return async () => {
          setIsCreatingFile(true)
        }

      case "assistants":
        return async () => {
          setIsCreatingAssistant(true)
        }

      case "models":
        return async () => {
          setIsCreatingModel(true)
        }

      default:
        break
    }
  }

  return (
    <div className="flex w-full space-x-2">
      <Button className="flex h-[36px] grow" onClick={getCreateFunction()}>
        <IconPlus className="mr-1" size={20} />
        {t(
          "New " +
            contentType.charAt(0).toUpperCase() +
            contentType.slice(1, contentType.length - 1)
        )}
      </Button>

      {hasData && (
        <Button className="size-[36px] p-1" onClick={handleCreateFolder}>
          <IconFolderPlus size={20} />
        </Button>
      )}

      {isCreatingFile && (
        <CreateFile isOpen={isCreatingFile} onOpenChange={setIsCreatingFile} />
      )}

      {isCreatingAssistant && (
        <CreateAssistant
          isOpen={isCreatingAssistant}
          onOpenChange={setIsCreatingAssistant}
        />
      )}

      {isCreatingModel && (
        <CreateModel
          isOpen={isCreatingModel}
          onOpenChange={setIsCreatingModel}
        />
      )}
    </div>
  )
}
