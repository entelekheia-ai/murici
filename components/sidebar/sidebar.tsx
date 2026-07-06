/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

// @ts-nocheck
import { ChatbotUIContext } from "@/context/context"
import { Tables } from "@/types/database"
import { ContentType } from "@/types"
import { FC, useContext } from "react"
import { TabsContent } from "../ui/tabs"
import { SidebarContent } from "./sidebar-content"
import { Button } from "../ui/button"
import { IconLayoutSidebar } from "@tabler/icons-react"

import { MenuSettings } from "./menu-settings"
import { ProfileSettings } from "../utility/profile-settings"
import { SidebarFilesContent } from "./sidebar-files"
import { SidebarAgentsContent } from "./sidebar-agents-content"
import { BrandLogo } from "../ui/brand-logo"

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
  const {
    folders,
    chats,
    files,
    assistants,
    models
  } = useContext(ChatbotUIContext)

  const chatFolders = folders.filter(folder => folder.type === "chats")
  const filesFolders = folders.filter(folder => folder.type === "files")
  const assistantFolders = folders.filter(
    folder => folder.type === "assistants"
  )
  const modelFolders = folders.filter(folder => folder.type === "models")

  const renderSidebarContent = (
    contentType: ContentType,
    data: any[],
    folders: Tables<"folders">[]
  ) => {
    return (
      <SidebarContent contentType={contentType} data={data} folders={folders} />
    )
  }

  return (
    <TabsContent
      className="m-0 w-full flex-1 overflow-hidden bg-[#f8f3ee] border-r border-[#e5e3df] border-solid"
      value={contentType}
    >
      <div className="flex h-full flex-col p-[20px] relative">
        <div className="drag-region flex items-center justify-between pl-20 pt-[2px]">
          <BrandLogo />
          <div className="no-drag">
            <Button
              className="h-8 w-8 cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
              variant="ghost"
              size="icon"
              onClick={onToggleSidebar}
            >
              <IconLayoutSidebar size={20} />
            </Button>
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden pt-[32px]">
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
        
        <div className="mt-auto pt-[20px]">
          <MenuSettings onContentTypeChange={onContentTypeChange} />
          <div className="hidden">
            <ProfileSettings />
          </div>
        </div>
      </div>
    </TabsContent>
  )
}
