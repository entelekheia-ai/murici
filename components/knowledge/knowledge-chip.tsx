/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

"use client"

import { FC, useState, useRef } from "react"
import { KnowledgeRecord } from "@/types/knowledge"
import { LLM } from "@/types"
import { updateKnowledgeRecord } from "@/lib/local-db/knowledge"
import { enrichKnowledgeRecord } from "@/lib/knowledge/enrich"
import { Button } from "@/components/ui/button"
import { IconCopy, IconCheck, IconPencil } from "@tabler/icons-react"
import { KnowledgePreviewModal } from "./knowledge-preview-modal"

const PLACEHOLDER_TITLE_RE = /^.+ · \d{2}:\d{2}$/

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

interface KnowledgeChipProps {
  record: KnowledgeRecord
  modelData?: LLM
  compact?: boolean
  chatName?: string
  onUpdate: (id: string, updates: Partial<KnowledgeRecord>) => void
}

export const KnowledgeChip: FC<KnowledgeChipProps> = ({
  record,
  modelData,
  compact = false,
  chatName,
  onUpdate
}) => {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(record.title)
  const [copied, setCopied] = useState(false)
  const [naming, setNaming] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isPlaceholder = PLACEHOLDER_TITLE_RE.test(record.title)
  const showNamingButton = (isPlaceholder || !record.summary) && !compact

  const createdAt = new Date(record.createdAt)
  const timeLabel = `${String(createdAt.getHours()).padStart(2, "0")}:${String(createdAt.getMinutes()).padStart(2, "0")}`

  const lang = record.payload.language || "text"

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(record.payload.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleTitleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (compact) return
    setEditing(true)
    setEditTitle(record.title)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const handleTitleSave = async () => {
    const trimmed = editTitle.trim()
    if (trimmed && trimmed !== record.title) {
      await updateKnowledgeRecord(record.id, { title: trimmed })
      onUpdate(record.id, { title: trimmed })
    }
    setEditing(false)
  }

  const handleNaming = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!modelData || naming) return
    setNaming(true)
    try {
      const result = await enrichKnowledgeRecord(record, modelData)
      if (result) {
        await updateKnowledgeRecord(record.id, result)
        onUpdate(record.id, result)
      }
    } finally {
      setNaming(false)
    }
  }

  return (
    <div
      className="bg-muted/50 hover:bg-muted group cursor-pointer rounded-lg border px-3 py-2 transition-colors"
      onClick={() => !compact && setPreviewOpen(true)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              ref={inputRef}
              className="bg-background w-full rounded border px-1 text-sm font-medium outline-none"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={e => {
                if (e.key === "Enter") handleTitleSave()
                if (e.key === "Escape") setEditing(false)
              }}
              onClick={e => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <span
              className="block truncate text-sm font-medium leading-snug"
              title={record.title}
              onClick={handleTitleClick}
            >
              {record.title}
            </span>
          )}
          <div className="mt-1 flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-xs font-mono ${languageColor(lang)}`}>
              {lang}
            </span>
            <span className="text-muted-foreground text-xs">{timeLabel}</span>
            {record.summary && !compact && (
              <span className="text-muted-foreground truncate text-xs italic">
                {record.summary}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {showNamingButton && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              onClick={handleNaming}
              disabled={naming}
            >
              {naming ? "..." : "✦ nomear"}
            </Button>
          )}
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {!compact && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  onClick={handleTitleClick}
                  title="Editar título"
                >
                  <IconPencil size={12} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  onClick={handleCopy}
                  title="Copiar conteúdo"
                >
                  {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {previewOpen && (
        <KnowledgePreviewModal
          record={record}
          chatName={chatName ?? "Conversa"}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  )
}
