/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import { KnowledgeRecord } from "@/types/knowledge"
import { v4 as uuidv4 } from "uuid"

const FENCE_RE = /```(\w*)\n([\s\S]*?)```/g
const MIN_LINES = 3

function nonEmptyLines(text: string): string[] {
  return text.split("\n").filter(line => line.trim().length > 0)
}

function extractFencedBlocks(
  content: string
): Array<{ language: string; content: string }> {
  const blocks: Array<{ language: string; content: string }> = []
  let match: RegExpExecArray | null

  FENCE_RE.lastIndex = 0
  while ((match = FENCE_RE.exec(content)) !== null) {
    const language = match[1] ?? ""
    const blockContent = match[2] ?? ""
    if (nonEmptyLines(blockContent).length >= MIN_LINES) {
      blocks.push({ language, content: blockContent })
    }
  }

  return blocks
}

function deriveTitle(language: string, content: string): string {
  const lang = language.toLowerCase()

  if (lang === "md" || lang === "markdown") {
    const headingMatch = content.match(/^#\s+(.+)$/m)
    if (headingMatch) return headingMatch[1].trim()
    const firstLine = nonEmptyLines(content)[0]
    return firstLine ?? "Untitled"
  }

  if (lang === "html") {
    const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i)
    if (titleMatch) return titleMatch[1].trim()
    const h1Match = content.match(/<h1[^>]*>([^<]+)<\/h1>/i)
    if (h1Match) return h1Match[1].trim()
  }

  const time = new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  })
  const label = lang || "text"
  return `${label} · ${time}`
}

export function buildKnowledgeRecords(
  message: { id: string; content: string; chat_id: string },
  conversationId: string,
  sourcePromptMessageId: string | null,
  agentId?: string
): KnowledgeRecord[] {
  const blocks = extractFencedBlocks(message.content)

  return blocks.map(block => ({
    id: uuidv4(),
    nodeType: "knowledge" as const,
    originConversationId: conversationId,
    messageId: message.id,
    sourcePromptMessageId,
    title: deriveTitle(block.language, block.content),
    summary: null,
    outputType: "GeneralContent",
    payload: { language: block.language, content: block.content },
    derivedFrom: [],
    agentRuns: agentId
      ? [{ agentId, runAt: new Date().toISOString(), role: "produced" as const }]
      : [],
    createdAt: new Date().toISOString()
  }))
}
