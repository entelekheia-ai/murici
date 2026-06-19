/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

"use client"

import { FC, useContext, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { ChatbotUIContext } from "@/context/context"
import { KnowledgeRecord } from "@/types/knowledge"
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react"

function languageColor(lang: string): string {
  const palette = [
    "bg-blue-500/20 text-blue-400",
    "bg-green-500/20 text-green-400",
    "bg-purple-500/20 text-purple-400",
    "bg-orange-500/20 text-orange-400",
    "bg-pink-500/20 text-pink-400",
    "bg-teal-500/20 text-teal-400",
    "bg-yellow-500/20 text-yellow-400"
  ]
  let hash = 0
  for (let i = 0; i < lang.length; i++) hash = (hash * 31 + lang.charCodeAt(i)) & 0xffff
  return palette[hash % palette.length]
}

export const KnowledgeSidebarSection: FC = () => {
  const { knowledge } = useContext(ChatbotUIContext)
  const [collapsed, setCollapsed] = useState(false)
  const router = useRouter()
  const params = useParams()

  const locale = (params?.locale as string) || "local"
  const workspaceid = (params?.workspaceid as string) || "local"

  const recent = [...knowledge]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3)

  if (knowledge.length === 0) return null

  return (
    <div className="mb-3">
      <button
        className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1 pb-1 text-xs font-semibold uppercase tracking-wider transition-colors"
        onClick={() => setCollapsed(v => !v)}
      >
        {collapsed ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
        Conhecimento
        <span className="ml-auto font-normal normal-case tracking-normal">
          {knowledge.length}
        </span>
      </button>

      {!collapsed && (
        <div className="flex flex-col gap-1">
          {recent.map(record => (
            <MiniChip key={record.id} record={record} />
          ))}

          <button
            className="text-muted-foreground hover:text-foreground mt-0.5 text-right text-xs transition-colors"
            onClick={() => router.push(`/${locale}/${workspaceid}/graph`)}
          >
            Ver tudo →
          </button>
        </div>
      )}
    </div>
  )
}

const MiniChip: FC<{ record: KnowledgeRecord }> = ({ record }) => {
  const lang = record.payload.language || "text"
  return (
    <div className="bg-muted/50 flex items-center gap-2 truncate rounded px-2 py-1">
      <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-mono ${languageColor(lang)}`}>
        {lang}
      </span>
      <span className="truncate text-xs" title={record.title}>
        {record.title}
      </span>
    </div>
  )
}
