/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { expect, Page } from "@playwright/test"

/** Serialize AI-SDK v5 UI-message-stream parts as an SSE body. */
export function sse(...parts: any[]): string {
  return (
    parts.map(p => `data: ${JSON.stringify(p)}\n\n`).join("") + "data: [DONE]\n\n"
  )
}

export const STREAM_HEADERS = {
  "content-type": "text/event-stream",
  "x-vercel-ai-ui-message-stream": "v1"
}

export const CANNED_REPLY = sse(
  { type: "start" },
  { type: "start-step" },
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: "pong" },
  { type: "text-end", id: "t1" },
  { type: "finish-step" },
  { type: "finish" }
)

/**
 * A canned stream that makes the model call a client-side tool. `dynamic: true` is
 * what makes the SDK route it to useChat's onToolCall.
 */
export function toolCallReply(
  toolName: string,
  input: any,
  toolCallId = `call_${Math.random().toString(36).slice(2)}`
): string {
  return sse(
    { type: "start" },
    { type: "start-step" },
    { type: "tool-input-available", toolCallId, toolName, input, dynamic: true },
    { type: "finish-step" },
    { type: "finish" }
  )
}

/**
 * On a fresh profile the app auto-loads the onboarding .agent into the thread that
 * is on screen and persists it as a chat. That is a RACE against anything a test
 * does first, so wait for it to settle and use it as the known "chat with an agent"
 * rather than pretending it isn't there.
 */
export async function settleOnboarding(page: Page) {
  const home = page.locator("textarea").first()
  await home.waitFor({ timeout: 30_000 })
  // The graph-home landing view keeps the left sidebar closed; clicking the input
  // leaves that view and opens the sidebar.
  await home.click()
  // The onboarding agent is loaded once its FSM panel is up...
  await expect(page.getByRole("heading", { name: "Detalhes" })).toBeVisible({
    timeout: 30_000
  })
  // ...and its chat row exists.
  await expect(
    page.locator("div.truncate", { hasText: "Bem-vindo ao Murici" }).first()
  ).toBeVisible({ timeout: 30_000 })
}
