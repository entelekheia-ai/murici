/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import {
  UIMessage,
  isTextUIPart,
  isToolUIPart,
  isDynamicToolUIPart,
  getToolName
} from "ai"
import { logger } from "@/lib/logger"

export type ToolInvocation = {
  toolCallId: string
  toolName: string
  input: unknown
  output: unknown
  state: string
}

// Vercel AI SDK's UIMessage stores content in `parts`, not `.text`/`.content`.
// `parts` can be missing on transient/placeholder message objects (e.g. before
// the SDK has attached any parts yet), so we guard against that here.
export function getMessageText(message: UIMessage | undefined | null): string {
  if (!message) {
    logger.info("getMessageText called with null/undefined message")
    return ""
  }
  return (message.parts ?? [])
    .filter(isTextUIPart)
    .map(part => part.text)
    .join("")
}

// Built-in tools (registered via `tool()`) surface as static `tool-<name>` parts;
// MCP tools (registered via `dynamicTool()`) surface as `dynamic-tool` parts.
export function getToolInvocations(
  message: UIMessage | undefined | null
): ToolInvocation[] {
  if (!message) {
    logger.info("getToolInvocations called with null/undefined message")
    return []
  }
  return (message.parts ?? [])
    .filter(part => isToolUIPart(part) || isDynamicToolUIPart(part))
    .map(part => ({
      toolCallId: part.toolCallId,
      toolName: getToolName(part),
      input: (part as any).input,
      output: (part as any).output,
      state: part.state
    }))
}

// A tool-result auto-resubmit can leave the SDK store with a PHANTOM copy of a
// tool-call part: a *later* assistant message carries a duplicate of an earlier
// message's tool call — same toolCallId, different message id — even though the
// tool executed only ONCE. Confirmed via the onToolCall probe: one invocation of
// call_… yet the projection reports it in two messages (dupToolCallIds: true,
// dupMessageIds: false). It reproduces for any client tool (e.g. save_doc) in a
// plain chat, so it's the resubmit path, not the FSM/model. See project/adr/0004
// log §13. Collapse it by keeping the FIRST occurrence of each toolCallId (it
// holds the executed output) and dropping later duplicates, so the model never
// re-sees the call and the UI doesn't render it twice. A message left with no
// parts after stripping (it existed only to carry the phantom) is dropped.
export function dedupeToolCallParts<T extends UIMessage>(messages: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const message of messages) {
    const parts = message.parts
    if (!Array.isArray(parts)) {
      out.push(message)
      continue
    }
    const kept = parts.filter(part => {
      if (!(isToolUIPart(part) || isDynamicToolUIPart(part))) return true
      const id = (part as any).toolCallId
      if (!id) return true
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    if (kept.length === parts.length) {
      out.push(message)
    } else if (kept.length > 0) {
      out.push({ ...message, parts: kept })
    }
    // kept.length === 0 (was > 0): message existed only for the phantom copy — drop.
  }
  return out
}

export function getReasoningText(
  message: UIMessage | undefined | null
): string {
  if (!message) {
    logger.info("getReasoningText called with null/undefined message")
    return ""
  }
  return (message.parts ?? [])
    .filter(part => part.type === "reasoning")
    .map(part => (part as any).text || "")
    .join("")
}
