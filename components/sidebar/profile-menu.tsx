/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use client"

import { ContentType } from "@/types"
import { IconChevronUp, IconFile, IconMessage, IconRobotFace, IconSettings, IconAffiliate } from "@tabler/icons-react"
import { FC, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { Button } from "../ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../ui/dropdown-menu"

const MENU_ITEMS: {
  type: ContentType
  icon: React.ElementType
  label: string
}[] = [
  { type: "chats", icon: IconMessage, label: "Chats" },
  { type: "files", icon: IconAffiliate, label: "Conhecimento" },
  { type: "assistants", icon: IconRobotFace, label: "Assistants" }
]

interface ProfileMenuProps {
  onContentTypeChange: (contentType: ContentType) => void
}

export const ProfileMenu: FC<ProfileMenuProps> = ({ onContentTypeChange }) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const params = useParams()
  const locale = (params?.locale as string) || "local"
  const workspaceid = (params?.workspaceid as string) || "local"

  const openSettings = () => {
    window.dispatchEvent(new Event("murici:profile-open"))
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-start rounded-full border border-sidebar-border bg-transparent hover:bg-sidebar-border/50 px-2 py-1.5 h-auto text-murici-text-primary"
        >
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-full bg-murici-green"></div>
              <span className="font-medium text-sm">{t("Perfil")}</span>
            </div>
            <IconChevronUp size={16} className="text-murici-text-secondary" />
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
        {MENU_ITEMS.map(({ type, icon: Icon, label }) => (
          <DropdownMenuItem
            key={type}
            onClick={() => {
              if (type === "files") {
                router.push(`/${locale}/${workspaceid}/graph`)
              } else {
                onContentTypeChange(type)
              }
              setOpen(false)
            }}
            className="cursor-pointer"
          >
            <Icon size={18} className="mr-2" />
            <span>{t(label)}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={openSettings} className="cursor-pointer">
          <IconSettings size={18} className="mr-2" />
          <span>{t("Configurações")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
