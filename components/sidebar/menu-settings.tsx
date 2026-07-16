"use client"
import { ChevronUp, File, MessageSquare, Settings, Network } from "lucide-react"
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

import { ContentType } from "@/types"

import Image from "next/image"
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
  icon: React.ElementType | null
  label: string
}[] = [
  { type: "chats", icon: MessageSquare, label: "Chats" },
  { type: "files", icon: Network, label: "Knowledge" },
  { type: "agents", icon: null, label: "Agents" }
]

interface MenuSettingsProps {
  onContentTypeChange: (contentType: ContentType) => void
}

export const MenuSettings: FC<MenuSettingsProps> = ({
  onContentTypeChange
}) => {
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
          className="h-auto w-full justify-start rounded-[12px] border border-[#e5e3df] bg-transparent p-[12px] text-[#1c1611] hover:bg-[#e5e3df]/50"
        >
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-instrument text-[14px] font-medium">
                {t("Settings")}
              </span>
            </div>
            <ChevronUp size={16} className="text-[#1c1611]" />
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)]"
      >
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
            {Icon ? (
              <Icon size={18} className="mr-2" />
            ) : (
              <Image
                src="/dot-agent-icon.png"
                alt=""
                width={18}
                height={18}
                className="mr-2 opacity-80"
              />
            )}
            <span>{t(label)}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={openSettings} className="cursor-pointer">
          <Settings size={18} className="mr-2" />
          <span>{t("Settings")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
