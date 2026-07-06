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
import { IconPlusFigma } from "@/components/icons/chat-icons"
import { FC, useContext, useState } from "react"
import { Button } from "../ui/button"
import { CreateAssistant } from "./items/assistants/create-assistant"
import { CreateFile } from "./items/files/create-file"
import { CreateModel } from "./items/models/create-model"

interface NewChatProps {
  contentType: ContentType
  hasData: boolean
}

export const NewChat: FC<NewChatProps> = ({
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

      case "agents":
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
    <div className="flex w-full">
      <Button
        variant="outline"
        className="flex h-[41px] grow items-center justify-start gap-2 rounded-[10px] border border-sidebar-border bg-[#ebe6de] p-3 text-murici-text-primary font-instrument font-semibold text-sm hover:bg-[#ebe6de]/80 dark:bg-accent dark:hover:bg-accent/80"
        onClick={getCreateFunction()}
      >
        <IconPlusFigma size={16} />
        {t("Novo chat")}
      </Button>

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
