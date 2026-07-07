import { Trash } from "lucide-react"
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
import { deleteFolder } from "@/db/folders"
import { supabase } from "@/lib/supabase/browser-client"
import { Tables } from "@/types/database"
import { ContentType } from "@/types"

import { FC, useContext, useRef, useState } from "react"
import { toast } from "sonner"

interface DeleteFolderProps {
  folder: Tables<"folders">
  contentType: ContentType
}

export const DeleteFolder: FC<DeleteFolderProps> = ({
  folder,
  contentType
}) => {
  const {
    setChats,
    setFolders,
    setFiles,
    setAssistants,
    setModels
  } = useContext(ChatbotUIContext)

  const buttonRef = useRef<HTMLButtonElement>(null)

  const [showFolderDialog, setShowFolderDialog] = useState(false)

  const stateUpdateFunctions = {
    chats: setChats,
    files: setFiles,
    agents: setAssistants,
    models: setModels
  }

  const handleDeleteFolderOnly = async () => {
    await deleteFolder(folder.id)

    setFolders(prevState => prevState.filter(c => c.id !== folder.id))

    setShowFolderDialog(false)

    const setStateFunction = stateUpdateFunctions[contentType]

    if (!setStateFunction) return

    setStateFunction((prevItems: any) =>
      prevItems.map((item: any) => {
        if (item.folder_id === folder.id) {
          return {
            ...item,
            folder_id: null
          }
        }

        return item
      })
    )
  }

  const handleDeleteFolderAndItems = async () => {
    const setStateFunction = stateUpdateFunctions[contentType]

    if (!setStateFunction) return

    const { error } = await supabase
      .from(contentType)
      .delete()
      .eq("folder_id", folder.id)

    if (error) {
      toast.error(error.message)
    }

    setStateFunction((prevItems: any) =>
      prevItems.filter((item: any) => item.folder_id !== folder.id)
    )

    handleDeleteFolderOnly()
  }

  return (
    <Dialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
      <DialogTrigger asChild>
        <Trash className="hover:opacity-50" size={18} />
      </DialogTrigger>

      <DialogContent className="min-w-[550px]">
        <DialogHeader>
          <DialogTitle>Delete {folder.name}</DialogTitle>

          <DialogDescription>
            Are you sure you want to delete this folder?
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setShowFolderDialog(false)}>
            Cancel
          </Button>

          <Button
            ref={buttonRef}
            variant="destructive"
            onClick={handleDeleteFolderAndItems}
          >
            Delete Folder & Included Items
          </Button>

          <Button
            ref={buttonRef}
            variant="destructive"
            onClick={handleDeleteFolderOnly}
          >
            Delete Folder Only
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
