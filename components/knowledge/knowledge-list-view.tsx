/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

"use client"

import { FC, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { KnowledgeRecord } from "@/types/knowledge"
import { Tables } from "@/types/database"
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react"

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
    return sortDir === "asc" ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />
  }

  const handleRowClick = (record: KnowledgeRecord) => {
    const chat = chatMap.get(record.originConversationId)
    setPreview({ record, chatName: chat?.name || "Conversa" })
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return `${d.toLocaleDateString()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      <div className="mb-4">
        <input
          className="bg-muted w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
          placeholder="Buscar por título ou resumo…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              {(
                [
                  { field: "title" as SortField, label: "Título" },
                  { field: "language" as SortField, label: "Linguagem" }
                ] as const
              ).map(({ field, label }) => (
                <th
                  key={field}
                  className="hover:bg-muted cursor-pointer px-4 py-2 text-left font-medium transition-colors"
                  onClick={() => toggleSort(field)}
                >
                  <span className="flex items-center gap-1">
                    {label}
                    <SortIcon field={field} />
                  </span>
                </th>
              ))}
              <th className="px-4 py-2 text-left font-medium">Conversa</th>
              <th
                className="hover:bg-muted cursor-pointer px-4 py-2 text-left font-medium transition-colors"
                onClick={() => toggleSort("createdAt")}
              >
                <span className="flex items-center gap-1">
                  Criado em
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
                  className="hover:bg-muted/50 cursor-pointer border-t transition-colors"
                  onClick={() => handleRowClick(record)}
                >
                  <td className="px-4 py-2">{record.title}</td>
                  <td className="px-4 py-2">
                    <span className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                      {record.payload.language || "text"}
                    </span>
                  </td>
                  <td className="max-w-[200px] px-4 py-2">
                    {chat ? (
                      <button
                        className="text-primary block w-full truncate text-left hover:underline"
                        title={chat.name}
                        onClick={e => {
                          e.stopPropagation()
                          router.push(`/${locale}/${workspaceid}/chat/${chat.id}`)
                        }}
                      >
                        {chat.name}
                      </button>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="text-muted-foreground whitespace-nowrap px-4 py-2 text-xs">
                    {formatDate(record.createdAt)}
                  </td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={4} className="text-muted-foreground py-8 text-center text-sm">
                  Nenhum resultado para "{query}"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-background flex max-h-[80vh] w-[80vw] max-w-[1200px] flex-col overflow-hidden rounded-xl border shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-4">
              <div>
                <h2 className="text-base font-semibold leading-snug">{preview.record.title}</h2>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {preview.record.payload.language || "text"} · {preview.chatName}
                </p>
              </div>
              <button
                className="text-muted-foreground hover:text-foreground shrink-0 text-lg leading-none"
                onClick={() => setPreview(null)}
              >
                ✕
              </button>
            </div>
            {preview.record.summary && (
              <p className="text-muted-foreground shrink-0 border-b px-6 py-2 text-sm italic">
                {preview.record.summary}
              </p>
            )}
            <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
              {["md", "markdown"].includes((preview.record.payload.language ?? "").toLowerCase()) ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {preview.record.payload.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <pre className="bg-muted overflow-auto rounded-lg p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                  {preview.record.payload.content}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
