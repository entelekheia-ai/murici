/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { Tables } from "@/types/database"
import { ContentType, DataItemType, DataListType } from "@/types"
import { FC, useState } from "react"
import { NewChat } from "./new-chat"
import { SidebarDataList } from "./sidebar-data-list"
import { SidebarSearch } from "./sidebar-search"

interface SidebarContentProps {
  contentType: ContentType
  data: DataListType
  folders: Tables<"folders">[]
  activeItemId?: string | null
  onSelectItem: (item: DataItemType) => void
  onUpdateItemFolder: (itemId: string, folderId: string | null) => Promise<void>
  renderItemActions?: (item: DataItemType) => React.ReactNode
  newChatLabel: string
  onNewChatClick: () => void
}

export const SidebarContent: FC<SidebarContentProps> = ({
  contentType,
  data,
  folders,
  activeItemId,
  onSelectItem,
  onUpdateItemFolder,
  renderItemActions,
  newChatLabel,
  onNewChatClick
}) => {
  const [searchTerm, setSearchTerm] = useState("")

  const filteredData: any = data.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    // Subtract 50px for the height of the workspace settings
    <div className="flex max-h-[calc(100%-50px)] grow flex-col">
      <div className="flex items-center mb-6">
        <NewChat
          label={newChatLabel}
          onClick={onNewChatClick}
        />
      </div>

      <div className="mb-6">
        <SidebarSearch
          contentType={contentType}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
        />
      </div>

      <SidebarDataList
        contentType={contentType}
        data={filteredData}
        folders={folders}
        activeItemId={activeItemId}
        onSelectItem={onSelectItem}
        onUpdateItemFolder={onUpdateItemFolder}
        renderItemActions={renderItemActions}
      />
    </div>
  )
}
