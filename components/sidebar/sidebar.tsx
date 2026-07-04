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
import { WorkspaceSettings } from "../workspace/workspace-settings"
import { SidebarContent } from "./sidebar-content"

import { ProfileMenu } from "./profile-menu"
import { ProfileSettings } from "../utility/profile-settings"
import { SidebarFilesContent } from "./sidebar-files"
import { SidebarAgentsContent } from "./sidebar-agents-content"

interface SidebarProps {
  contentType: ContentType
  showSidebar: boolean
  onContentTypeChange: (contentType: ContentType) => void
}

export const Sidebar: FC<SidebarProps> = ({ contentType, showSidebar, onContentTypeChange }) => {
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
      className="m-0 w-full flex-1 overflow-hidden"
      value={contentType}
    >
      <div className="flex h-full flex-col">
        <div className="drag-region flex h-12 items-center justify-between pl-20 pr-4 mb-4">
          <div className="flex items-center gap-2 select-none pt-1">
            <span className="font-signika font-medium text-[36px] leading-none text-[#0B2C1A] dark:text-[#FFEAB4]">murici</span>
          </div>
          <div className="no-drag">
            <WorkspaceSettings />
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden p-5 pt-0">
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
        
        <div className="mt-auto p-5">
          <ProfileMenu onContentTypeChange={onContentTypeChange} />
          <div className="hidden">
            <ProfileSettings />
          </div>
        </div>
      </div>
    </TabsContent>
  )
}
