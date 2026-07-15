/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { test, expect } from "../fixtures"
import { CANNED_REPLY, settleOnboarding, STREAM_HEADERS } from "../helpers/agent-chat"

/*
 * The "switch to a DIFFERENT, already-existing chat while another one is still
 * streaming" path (ADR-0007). Its sibling channel-agent-isolation.spec.ts covers the
 * "Novo chat" path; this one covers navigating to an existing chat, which reaches the
 * viewed thread through the router rather than through a freshly minted id.
 *
 * Deterministic on purpose: the chat route is STUBBED. This test used to drive a real
 * local model and hold its response with a timer, and it was unrunnable — a small
 * quantized model reliably emits a malformed tool call (`name: "unknown"`, `arguments`
 * as a JSON list) that its own server then rejects with a 422, so the test went red on
 * the model's behavior rather than on the app's. Holding the response ourselves gives
 * the same race with none of that.
 */

test("switching to a different existing chat mid-stream does not leak messages, and the background reply lands in the chat that sent it", async ({
  page
}) => {
  test.setTimeout(120_000)

  // Chat A's reply is held open until the test releases it — that is the window in
  // which we navigate away.
  let releaseHeldReply: (() => void) | null = null
  let holdNextReply = false

  await page.route("**/api/chat/**", async route => {
    if (route.request().method() !== "POST") return route.continue()

    if (holdNextReply) {
      holdNextReply = false
      await new Promise<void>(resolve => {
        releaseHeldReply = resolve
      })
    }
    await route.fulfill({
      status: 200,
      headers: STREAM_HEADERS,
      body: CANNED_REPLY
    })
  })

  await page.goto("/local/chat")
  await settleOnboarding(page)

  // ---- Chat B: a normal, completed conversation, left behind in the sidebar.
  await page.getByRole("button", { name: "Novo chat" }).click()
  const input = page.locator("textarea").first()
  await input.click()
  await input.fill("chat b marker")
  await input.press("Enter")
  await expect(page.locator('[data-message-role="assistant"]')).toHaveCount(1, {
    timeout: 30_000
  })

  // ---- Chat A: send, and hold its reply open.
  await page.getByRole("button", { name: "Novo chat" }).click()
  holdNextReply = true
  await input.click()
  await input.fill("hello")
  await input.press("Enter")
  await expect(
    page.locator('[data-message-role="user"]').getByText("hello")
  ).toBeVisible({ timeout: 10_000 })

  // ---- Navigate to the EXISTING chat B while chat A is still streaming.
  await page
    .locator("div.truncate", { hasText: "chat b marker" })
    .first()
    .click()
  await expect(
    page.locator('[data-message-role="user"]').getByText("chat b marker")
  ).toBeVisible()
  await expect(
    page.locator('[data-message-role="user"]').getByText("hello")
  ).toHaveCount(0)

  // Chat A is still generating, off screen — and the sidebar says so. This is the
  // counterpart of "Novo chat" no longer aborting the stream you walk away from.
  await expect(page.locator('[data-generating="true"]')).toHaveCount(1)

  const chatBAssistants = await page
    .locator('[data-message-role="assistant"]')
    .count()

  // ---- Let chat A's reply arrive while chat B is on screen.
  await expect.poll(() => releaseHeldReply !== null).toBe(true)
  releaseHeldReply!()

  await expect(page.locator('[data-generating="true"]')).toHaveCount(0, {
    timeout: 30_000
  })

  // Chat B's view must be untouched by it.
  await expect(
    page.locator('[data-message-role="user"]').getByText("hello")
  ).toHaveCount(0)
  await expect(page.locator('[data-message-role="assistant"]')).toHaveCount(
    chatBAssistants
  )

  // ---- Back to chat A: the reply is waiting there, in the chat that sent it.
  await page.locator("div.truncate", { hasText: "hello" }).first().click()
  await expect(
    page.locator('[data-message-role="user"]').getByText("hello")
  ).toBeVisible()
  await expect
    .poll(() => page.locator('[data-message-role="assistant"]').count(), {
      timeout: 15_000
    })
    .toBeGreaterThan(0)
})
