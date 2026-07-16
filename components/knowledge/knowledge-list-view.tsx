"use client"
import { ChevronDown, ChevronUp } from "lucide-react"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { FC, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { useTranslation } from "react-i18next"
import { KnowledgeRecord } from "@/types/knowledge"
import { Tables } from "@/types/database"

import { KnowledgePreviewModal } from "./knowledge-preview-modal"

type SortField = "createdAt" | "title" | "language"
type SortDir = "asc" | "desc"

interface Props {
  knowledge: KnowledgeRecord[]
  chats: Tables<"chats">[]
}

interface PreviewState {
  record: KnowledgeRecord
  chatName: string
}

export const KnowledgeListView: FC<Props> = ({ knowledge, chats }) => {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  const [sortField, setSortField] = useState<SortField>("createdAt")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const router = useRouter()
  const params = useParams()
  const locale = (params?.locale as string) || "local"
  const workspaceid = (params?.workspaceid as string) || "local"

  const chatMap = new Map(chats.map(c => [c.id, c]))

  const filtered = knowledge.filter(k => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      k.title.toLowerCase().includes(q) ||
      (k.summary ?? "").toLowerCase().includes(q)
    )
  })

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortField === "createdAt") {
      cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    } else if (sortField === "title") {
      cmp = a.title.localeCompare(b.title)
    } else if (sortField === "language") {
      cmp = a.payload.language.localeCompare(b.payload.language)
    }
    return sortDir === "asc" ? cmp : -cmp
  })

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDir("desc")
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDir === "asc" ? (
      <ChevronUp size={12} />
    ) : (
      <ChevronDown size={12} />
    )
  }

  const handleRowClick = (record: KnowledgeRecord) => {
    const chat = chatMap.get(record.originConversationId)
    setPreview({ record, chatName: chat?.name || t("Conversation") })
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return `${d.toLocaleDateString()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      <div className="mb-4">
        <input
          className="w-full rounded-lg border bg-muted px-3 py-2 text-sm outline-none focus:ring-2"
          placeholder={t("Search by title or summary…")}
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/50">
            <tr>
              {(
                [
                  { field: "title" as SortField, label: t("Title") },
                  {
                    field: "language" as SortField,
                    label: t("Snippet Language")
                  }
                ] as const
              ).map(({ field, label }) => (
                <th
                  key={field}
                  className="cursor-pointer px-4 py-2 text-left font-medium transition-colors hover:bg-muted"
                  onClick={() => toggleSort(field)}
                >
                  <span className="flex items-center gap-1">
                    {label}
                    <SortIcon field={field} />
                  </span>
                </th>
              ))}
              <th className="px-4 py-2 text-left font-medium">
                {t("Conversation")}
              </th>
              <th
                className="cursor-pointer px-4 py-2 text-left font-medium transition-colors hover:bg-muted"
                onClick={() => toggleSort("createdAt")}
              >
                <span className="flex items-center gap-1">
                  {t("Created")}
                  <SortIcon field="createdAt" />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(record => {
              const chat = chatMap.get(record.originConversationId)
              return (
                <tr
                  key={record.id}
                  className="cursor-pointer border-t transition-colors hover:bg-muted/50"
                  onClick={() => handleRowClick(record)}
                >
                  <td className="px-4 py-2">{record.title}</td>
                  <td className="px-4 py-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {record.payload.language || "text"}
                    </span>
                  </td>
                  <td className="max-w-[200px] px-4 py-2">
                    {chat ? (
                      <button
                        className="block w-full truncate text-left text-foreground-primary hover:underline"
                        title={chat.name}
                        onClick={e => {
                          e.stopPropagation()
                          router.push(
                            `/${locale}/${workspaceid}/chat/${chat.id}`
                          )
                        }}
                      >
                        {chat.name}
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
                    {formatDate(record.createdAt)}
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  {t('No results for "{{query}}"', { query })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {preview && (
        <KnowledgePreviewModal
          record={preview.record}
          chatName={preview.chatName}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  )
}
