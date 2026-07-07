"use client"
import { Copy, Check, Pencil } from "lucide-react"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { FC, useState, useRef } from "react"
import { KnowledgeRecord } from "@/types/knowledge"
import { LLM } from "@/types"
import { updateKnowledgeRecord } from "@/lib/local-db/knowledge"
import { enrichKnowledgeRecord, triggerEnrichment } from "@/lib/knowledge/enrich"
import { Button } from "@/components/ui/button"

import { ChatbotUIContext } from "@/context/context"
import { useContext } from "react"
import { KnowledgePreviewModal } from "./knowledge-preview-modal"

const PLACEHOLDER_TITLE_RE = /^.+ · \d{2}:\d{2}$/


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
  const { setKnowledge, setBackgroundQueue } = useContext(ChatbotUIContext)

  const isPlaceholder = PLACEHOLDER_TITLE_RE.test(record.title)
  const showNamingButton = (isPlaceholder || !record.summary) && !compact


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

    if (setBackgroundQueue && setKnowledge) {
      triggerEnrichment([record], modelData, setKnowledge, setBackgroundQueue)
    } else {
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
  }

  return (
    <div
      className="group flex items-center justify-between gap-3 py-2 cursor-pointer transition-colors w-full"
      onClick={() => !compact && setPreviewOpen(true)}
    >
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        {editing ? (
          <input
            ref={inputRef}
            className="bg-background w-full rounded border px-1 text-[13px] font-medium outline-none text-foreground-primary"
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
            className="block truncate text-[13px] font-medium leading-tight text-foreground-primary"
            title={record.title}
            onClick={handleTitleClick}
          >
            {record.title}
          </span>
        )}
        
        {record.summary && !compact && (
          <span className="text-foreground-secondary text-[11px] leading-tight line-clamp-2 mt-0.5">
            {record.summary}
          </span>
        )}
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
                  <Pencil size={12} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  onClick={handleCopy}
                  title="Copiar conteúdo"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                </Button>
              </>
            )}
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
