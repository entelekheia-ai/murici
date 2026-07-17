/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { ChatbotUIContext } from "@/context/context"
import { Tables } from "@/types/database"
import { ContentType, DataItemType } from "@/types"
import { FC, useContext, useState } from "react"
import { useTranslation } from "react-i18next"
import { useParams, useRouter } from "next/navigation"

import { updateAssistant } from "@/db/assistants"
import { updateChat } from "@/db/chats"
import { updateFile } from "@/db/files"
import { updateModel } from "@/db/models"
import { useChatHandler } from "@/lib/hooks/use-chat-handler"

import { TabsContent } from "../ui/tabs"
import { SidebarContent } from "./sidebar-content"
import { Button } from "../ui/button"
import { IconSidebarToggle } from "../icons/chat-icons"

import { MenuSettings } from "./menu-settings"
import { ProfileSettings } from "../utility/profile-settings"
import { SidebarFilesContent } from "./sidebar-files"
import { SidebarAgentsContent } from "./sidebar-agents-content"
import { BrandLogo } from "../ui/brand-logo"

import { CreateModel } from "./items/models/create-model"
import { UpdateChat } from "./items/chat/update-chat"
import { DeleteChat } from "./items/chat/delete-chat"

interface SidebarProps {
  contentType: ContentType
  showSidebar: boolean
  onContentTypeChange: (contentType: ContentType) => void
  onToggleSidebar: () => void
}

export const Sidebar: FC<SidebarProps> = ({
  contentType,
  showSidebar,
  onContentTypeChange,
  onToggleSidebar
}) => {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useParams()

  const {
    folders,
    chats,
    files,
    assistants,
    models,
    setChats,
    setFiles,
    setAssistants,
    setModels,
    selectedWorkspace,
    selectedChat
  } = useContext(ChatbotUIContext)

  // Creation dialog states
  const [isCreatingModel, setIsCreatingModel] = useState(false)

  const { handleNewChat } = useChatHandler()

  // OS detection for macOS
  const isMac =
    typeof window !== "undefined" &&
    (window.electronAPI?.platform === "darwin" ||
      /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent))

  const chatFolders = folders.filter(folder => folder.type === "chats")
  const filesFolders = folders.filter(folder => folder.type === "files")
  const assistantFolders = folders.filter(
    folder => folder.type === "assistants"
  )
  const modelFolders = folders.filter(folder => folder.type === "models")

  // Event handlers
  const handleSelectItem = (item: DataItemType) => {
    if (!selectedWorkspace) return
    if (contentType === "chats") {
      router.push(`/${selectedWorkspace.id}/chat/${item.id}`)
    }
  }

  const handleUpdateItemFolder = async (
    itemId: string,
    folderId: string | null
  ) => {
    const item: any = [...chats, ...files, ...assistants, ...models].find(
      i => i.id === itemId
    )

    if (!item) return

    const updateFunctions = {
      chats: updateChat,
      files: updateFile,
      agents: updateAssistant,
      models: updateModel
    }

    const stateUpdateFunctions = {
      chats: setChats,
      files: setFiles,
      agents: setAssistants,
      models: setModels
    }

    const updateFunction = updateFunctions[contentType]
    const setStateFunction = stateUpdateFunctions[contentType]

    if (!updateFunction || !setStateFunction) return

    const updatedItem = await updateFunction(item.id, {
      folder_id: folderId
    })

    setStateFunction((items: any) =>
      items.map((i: any) => (i.id === updatedItem.id ? updatedItem : i))
    )
  }

  const handleNewChatClick = () => {
    switch (contentType) {
      case "chats":
        handleNewChat()
        break
      case "models":
        setIsCreatingModel(true)
        break
      default:
        break
    }
  }

  const getNewChatButtonLabel = () => {
    switch (contentType) {
      case "chats":
        return t("Novo chat")
      case "models":
        return t("Novo modelo")
      default:
        return t("Novo")
    }
  }

  const renderItemActions = (item: DataItemType) => {
    if (contentType === "chats") {
      return (
        <>
          <UpdateChat chat={item as Tables<"chats">} />
          <DeleteChat chat={item as Tables<"chats">} />
        </>
      )
    }
    return null
  }

  const renderSidebarContent = (
    contentType: ContentType,
    data: any[],
    folders: Tables<"folders">[]
  ) => {
    return (
      <SidebarContent
        contentType={contentType}
        data={data}
        folders={folders}
        activeItemId={
          selectedChat?.id ||
          (Array.isArray(params.chatid) ? params.chatid[0] : params.chatid) ||
          null
        }
        onSelectItem={handleSelectItem}
        onUpdateItemFolder={handleUpdateItemFolder}
        renderItemActions={renderItemActions}
        newChatLabel={getNewChatButtonLabel()}
        onNewChatClick={handleNewChatClick}
      />
    )
  }

  return (
    <TabsContent
      className="relative m-0 w-full flex-1 overflow-hidden"
      value={contentType}
    >
      <div
        className="relative flex h-full flex-col gap-[24px] px-[16px] pb-[20px]"
        style={{ paddingTop: isMac ? "40px" : "12px" }}
      >
        {/* Absolute-positioned toggle button matching Figma layout */}
        <div className="no-drag absolute right-[12px] top-[12px] z-50">
          <Button
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-800"
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
          >
            <IconSidebarToggle side="left" type="hide" size={16} />
          </Button>
        </div>

        {/* Draggable header region */}
        <div className="drag-region flex items-center">
          <BrandLogo />
        </div>

        {/* Main switcher content list */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {(() => {
            switch (contentType) {
              case "chats":
                return renderSidebarContent("chats", chats, chatFolders)

              case "files":
                return <SidebarFilesContent />

              case "agents":
                return <SidebarAgentsContent />

              case "models":
                return renderSidebarContent("models", models, modelFolders)

              default:
                return null
            }
          })()}
        </div>

        {/* Footer settings menu */}
        <div className="mt-auto">
          <MenuSettings onContentTypeChange={onContentTypeChange} />
          <div className="hidden">
            <ProfileSettings />
          </div>
        </div>
      </div>

      {/* Render dialogs in parent container scope */}

      {isCreatingModel && (
        <CreateModel
          isOpen={isCreatingModel}
          onOpenChange={setIsCreatingModel}
        />
      )}
    </TabsContent>
  )
}
