/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

// @ts-nocheck
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet"
import { ChatbotUIContext } from "@/context/context"
import { createAssistantFiles } from "@/db/assistant-files"
import { createAssistant, updateAssistant } from "@/db/assistants"
import { createChat } from "@/db/chats"
import { createFileBasedOnExtension } from "@/db/files"
import { createModel } from "@/db/models"
import {
  getAssistantImageFromStorage,
  uploadAssistantImage
} from "@/db/storage/assistant-images"
import { convertBlobToBase64 } from "@/lib/blob-to-b64"
import { Tables, TablesInsert } from "@/types/database"
import { ContentType } from "@/types"
import { FC, useContext, useRef, useState } from "react"
import { toast } from "sonner"

interface SidebarCreateItemProps {
  isOpen: boolean
  isTyping: boolean
  onOpenChange: (isOpen: boolean) => void
  contentType: ContentType
  renderInputs: () => JSX.Element
  createState: any
}

export const SidebarCreateItem: FC<SidebarCreateItemProps> = ({
  isOpen,
  onOpenChange,
  contentType,
  renderInputs,
  createState,
  isTyping
}) => {
  const {
    selectedWorkspace,
    setChats,
    setFiles,
    setAssistants,
    setAssistantImages,
    setModels
  } = useContext(ChatbotUIContext)

  const buttonRef = useRef<HTMLButtonElement>(null)

  const [creating, setCreating] = useState(false)

  const createFunctions = {
    chats: createChat,
    files: async (
      createState: { file: File } & TablesInsert<"files">,
      workspaceId: string
    ) => {
      if (!selectedWorkspace) return

      const { file, ...rest } = createState

      const createdFile = await createFileBasedOnExtension(
        file,
        rest,
        workspaceId,
        selectedWorkspace.embeddings_provider as "openai" | "local"
      )

      return createdFile
    },
    assistants: async (
      createState: {
        image: File
        files: Tables<"files">[]
      } & Tables<"assistants">,
      workspaceId: string
    ) => {
      const { image, files, ...rest } = createState

      const createdAssistant = await createAssistant(rest, workspaceId)

      let updatedAssistant = createdAssistant

      if (image) {
        const filePath = await uploadAssistantImage(createdAssistant, image)

        updatedAssistant = await updateAssistant(createdAssistant.id, {
          image_path: filePath
        })

        const url = (await getAssistantImageFromStorage(filePath)) || ""

        if (url) {
          const response = await fetch(url)
          const blob = await response.blob()
          const base64 = await convertBlobToBase64(blob)

          setAssistantImages(prev => [
            ...prev,
            {
              assistantId: updatedAssistant.id,
              path: filePath,
              base64,
              url
            }
          ])
        }
      }

      const assistantFiles = files.map(file => ({
        user_id: rest.user_id,
        assistant_id: createdAssistant.id,
        file_id: file.id
      }))

      await createAssistantFiles(assistantFiles)

      return updatedAssistant
    },
    models: createModel
  }

  const stateUpdateFunctions = {
    chats: setChats,
    files: setFiles,
    assistants: setAssistants,
    models: setModels
  }

  const handleCreate = async () => {
    try {
      if (!selectedWorkspace) return
      if (isTyping) return // Prevent creation while typing

      const createFunction = createFunctions[contentType]
      const setStateFunction = stateUpdateFunctions[contentType]

      if (!createFunction || !setStateFunction) return

      setCreating(true)

      const newItem = await createFunction(createState, selectedWorkspace.id)

      setStateFunction((prevItems: any) => [...prevItems, newItem])

      onOpenChange(false)
      setCreating(false)
    } catch (error) {
      toast.error(`Error creating ${contentType.slice(0, -1)}. ${error}.`)
      setCreating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isTyping && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      buttonRef.current?.click()
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex min-w-[450px] flex-col justify-between overflow-auto"
        side="left"
        onKeyDown={handleKeyDown}
      >
        <div className="grow overflow-auto">
          <SheetHeader>
            <SheetTitle className="text-2xl font-bold">
              Create{" "}
              {contentType.charAt(0).toUpperCase() + contentType.slice(1, -1)}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-3">{renderInputs()}</div>
        </div>

        <SheetFooter className="mt-2 flex justify-between">
          <div className="flex grow justify-end space-x-2">
            <Button
              disabled={creating}
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>

            <Button disabled={creating} ref={buttonRef} onClick={handleCreate}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
