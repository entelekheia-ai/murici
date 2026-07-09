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

interface DiscoveredModel {
  modelId: string
}

function pickRandom<T>(items: T[], count: number): T[] {
  const pool = [...items]
  const picked: T[] = []
  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length)
    picked.push(pool.splice(index, 1)[0])
  }
  return picked
}

/*
 * Smoke test for the whole local-inference path: open the chat screen, send
 * a message to a randomly picked auto-discovered local model, and confirm
 * the reply actually reaches the UI. This exists because the model can
 * generate a reply server-side while the UI never shows it — a gap none of
 * the other layers (which mock the LLM) can catch.
 *
 * Runs against 2 randomly chosen models (or just 1 if only one is
 * discovered): if the first model's reply never shows up, that's a failure
 * and the second model is not attempted; if it does show up, the second
 * model is tried too.
 */
test("sends a message to a random locally discovered model and receives a reply in the UI", async ({
  page,
  request
}) => {
  // The 30s reply-wait assertion alone eats Playwright's default 30s test
  // timeout, leaving no room to run the on-failure HTML dump below before
  // the whole test (and its page) gets force-closed.
  test.setTimeout(90_000)

  const discoverResponse = await request.get("/api/models/discover")
  const models: DiscoveredModel[] = await discoverResponse.json()

  test.skip(
    models.length === 0,
    "No local models discovered — start a local OpenAI-compatible server (oMLX, Ollama, etc.) first"
  )

  const candidates = pickRandom(models, Math.min(2, models.length))

  for (const [index, model] of candidates.entries()) {
    await test.step(`model ${index + 1}/${candidates.length}: ${model.modelId}`, async () => {
      // Pre-select the model via localStorage before the first script on
      // the page runs (same pattern as chat-tool-calling.spec.ts), instead
      // of navigating then reloading — a reload while unrelated background
      // requests (MCP tools, agent unpack) are in flight can abort them,
      // adding unrelated noise to this test.
      await page.addInitScript(modelId => {
        window.localStorage.setItem("murici_selected_model", modelId)
      }, model.modelId)
      await page.goto("/local/chat")

      const input = page.locator("textarea").first()
      await input.waitFor({ timeout: 30_000 })

      const assistantMessages = page.locator('[data-message-role="assistant"]')
      const assistantCountBefore = await assistantMessages.count()

      await input.click()
      await input.fill("Reply with exactly the word: pong")
      await input.press("Enter")

      // Assert on the actual rendered message tree (data-message-role, set
      // on components/messages/message.tsx's root) instead of just matching
      // reply text — this is what actually distinguishes "the reply never
      // reached the UI" from "it reached the UI with different wording".
      try {
        await expect(assistantMessages).toHaveCount(assistantCountBefore + 1, {
          timeout: 30_000
        })
      } catch (error) {
        const html = await page.locator("body").innerHTML()
        await test.info().attach("chat-dom-on-failure.html", {
          body: html,
          contentType: "text/html"
        })
        throw error
      }

      const newAssistantMessage = assistantMessages.last()
      await expect(newAssistantMessage).not.toBeEmpty({ timeout: 5_000 })
    })
  }
})
