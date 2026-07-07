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
  return (message?.parts ?? [])
    .filter(isTextUIPart)
    .map(part => part.text)
    .join("")
}

// Built-in tools (registered via `tool()`) surface as static `tool-<name>` parts;
// MCP tools (registered via `dynamicTool()`) surface as `dynamic-tool` parts.
export function getToolInvocations(message: UIMessage | undefined | null): ToolInvocation[] {
  return (message?.parts ?? [])
    .filter(part => isToolUIPart(part) || isDynamicToolUIPart(part))
    .map(part => ({
      toolCallId: part.toolCallId,
      toolName: getToolName(part),
      input: (part as any).input,
      output: (part as any).output,
      state: part.state
    }))
}
