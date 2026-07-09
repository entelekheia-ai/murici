/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { test, expect } from "../fixtures"

/*
 * Smoke test for the whole local-inference path: open the chat screen, send a
 * message to a specific auto-discovered local model, and confirm the reply
 * actually reaches the UI. This exists because the model can generate a reply
 * server-side while the UI never shows it — a gap none of the other layers
 * (which mock the LLM) can catch.
 *
 * Fixed spread of sizes/families (a tiny 1B, a mid reasoning model, and a 20B
 * MoE) rather than a random pick, so a failure is reproducible and points at a
 * concrete model. One test per model; they run serially (workers: 1 in
 * playwright.config.ts) so the shared local server never loads two models at
 * once and runs out of RAM.
 *
 * `thinks` marks models that emit <think> reasoning: the server wraps them with
 * extractReasoningMiddleware({ tagName: "think" }), so their reasoning arrives
 * as `reasoning` parts and must render in a MessageThinkingBlock. Asserting that
 * block appears is the automated guard for the "reasoning vanished when the
 * stream ended" bug (it was keyed by a recomputed sequence_number that diverged
 * across the streaming -> persisted handoff; it's keyed by message id now).
 *
 * Requires a local OpenAI-compatible server (oMLX, etc.) exposing these ids;
 * each test skips itself if its model isn't discovered.
 */
const MODELS: { id: string; thinks: boolean }[] = [
  { id: "Llama-3.2-1B-Instruct-4bit", thinks: false },
  { id: "Qwen3.5-9B-OptiQ-4bit", thinks: true },
  { id: "gpt-oss-20b-MXFP4-Q8", thinks: true }
]

for (const model of MODELS) {
  test(`sends a message to ${model.id} and receives a reply in the UI`, async ({
    page,
    request
  }) => {
    // Big models load lazily on the server on first request — generous budget.
    test.setTimeout(180_000)

    // Skip cleanly if this server doesn't expose the model.
    const discovered = await (await request.get("/api/models/discover")).json()
    test.skip(
      !Array.isArray(discovered) ||
        !discovered.some((m: { modelId: string }) => m.modelId === model.id),
      `${model.id} not discovered — start a local server exposing it first`
    )

    // Pre-select the model via localStorage before the first script runs (same
    // pattern as chat-tool-calling.spec.ts).
    await page.addInitScript(id => {
      window.localStorage.setItem("murici_selected_model", id)
    }, model.id)

    // Gate on the client-side discovery finishing before we send: resolveCustomModel
    // needs availableLocalModels populated (global-state fetches /api/models/discover
    // on mount), otherwise the send resolves to an empty base_url and the request
    // never reaches the local server — a silent failure, and the exact "no request
    // to the local server" symptom this test is here to catch.
    const clientDiscovery = page.waitForResponse(
      r => r.url().includes("/api/models/discover"),
      { timeout: 30_000 }
    )
    await page.goto("/local/chat")
    await clientDiscovery

    const input = page.locator("textarea").first()
    await input.waitFor({ timeout: 30_000 })

    const assistantMessages = page.locator('[data-message-role="assistant"]')
    const assistantCountBefore = await assistantMessages.count()

    // Fast-fail on the actual regression class: the send must produce a POST to
    // the chat route. If it doesn't, the model was never reached (resolution
    // failure) — surfaced in 15s instead of waiting out the full reply timeout.
    const chatRequest = page.waitForRequest(
      r => r.url().includes("/api/chat/") && r.method() === "POST",
      { timeout: 15_000 }
    )

    await input.click()
    await input.fill("Reply with exactly the word: pong")
    await input.press("Enter")

    await chatRequest

    // Assert on the actual rendered message tree (data-message-role, set on
    // components/messages/message.tsx's root) — this is what distinguishes "the
    // reply never reached the UI" from "it reached the UI with different wording".
    try {
      await expect(assistantMessages).toHaveCount(assistantCountBefore + 1, {
        timeout: 120_000
      })
    } catch (error) {
      const html = await page.locator("body").innerHTML()
      await test.info().attach(`chat-dom-on-failure-${model.id}.html`, {
        body: html,
        contentType: "text/html"
      })
      throw error
    }

    await expect(assistantMessages.last()).not.toBeEmpty({ timeout: 10_000 })

    // Reasoning models must surface their <think> in a MessageThinkingBlock —
    // and it must still be there after the stream finished, not just flash
    // mid-stream and disappear on the persisted-message handoff.
    if (model.thinks) {
      await expect(page.getByTestId("thinking-block").last()).toBeVisible({
        timeout: 10_000
      })
    }
  })
}
