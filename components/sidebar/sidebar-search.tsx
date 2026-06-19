/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import { ContentType } from "@/types"
import { FC } from "react"
import { useTranslation } from "react-i18next"
import { Input } from "../ui/input"

interface SidebarSearchProps {
  contentType: ContentType
  searchTerm: string
  setSearchTerm: Function
}

export const SidebarSearch: FC<SidebarSearchProps> = ({
  contentType,
  searchTerm,
  setSearchTerm
}) => {
  const { t } = useTranslation()

  return (
    <Input
      placeholder={t(`Search ${contentType}...`)}
      value={searchTerm}
      onChange={e => setSearchTerm(e.target.value)}
    />
  )
}
