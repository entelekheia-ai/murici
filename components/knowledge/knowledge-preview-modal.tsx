"use client"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { FC } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { KnowledgeRecord } from "@/types/knowledge"

interface KnowledgePreviewModalProps {
  record: KnowledgeRecord
  chatName: string
  onClose: () => void
  overlay?: "fixed" | "absolute"
}

export const KnowledgePreviewModal: FC<KnowledgePreviewModalProps> = ({
  record,
  chatName,
  onClose,
  overlay = "fixed"
}) => {
  const overlayClass =
    overlay === "fixed"
      ? "fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      : "absolute inset-0 flex items-center justify-center bg-black/40"

  const isMarkdown = ["md", "markdown"].includes(
    (record.payload.language ?? "").toLowerCase()
  )

  return (
    <div className={overlayClass} onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-[80vw] max-w-[1200px] flex-col overflow-hidden rounded-xl border bg-background shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-4">
          <div>
            <h2 className="text-base font-semibold leading-snug">{record.title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {record.payload.language || "text"} · {chatName}
            </p>
          </div>
          <button
            className="shrink-0 text-lg leading-none text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {record.summary && (
          <p className="shrink-0 border-b px-6 py-2 text-sm italic text-muted-foreground">
            {record.summary}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
          {isMarkdown ? (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {record.payload.content}
              </ReactMarkdown>
            </div>
          ) : (
            <pre className="overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed">
              {record.payload.content}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
