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

// Ad-hoc verification for two more fixes:
//  - Bug 2: home screen's ".agent" pill button needed two clicks (the
//    wrapper's onClickCapture swallowed the first one).
//  - Bug 1: clicking a recent/onboarding agent while already in an existing
//    chat opened the KnowledgeHomeView instead of a new chat with the agent
//    loaded.

test("home screen '.agent' button opens the file picker on the first click", async ({
  page
}) => {
  await page.goto("/local/chat")
  await page.locator("textarea").first().waitFor({ timeout: 30_000 })

  const filechooser = page.waitForEvent("filechooser", { timeout: 3_000 })
  await page.getByText("Iniciar um .agent").click()
  await expect(filechooser).resolves.toBeTruthy()
})

test("opening the onboarding agent while an existing chat is active lands on the chat, not KnowledgeHomeView", async ({
  page,
  request
}) => {
  test.setTimeout(60_000)

  const discovered = await (await request.get("/api/models/discover")).json()
  const model = Array.isArray(discovered) ? discovered[0] : null
  test.skip(!model, "No local model discovered — start a local server first")

  await page.addInitScript(id => {
    window.localStorage.setItem("murici_selected_model", id)
  }, model.modelId)

  const clientDiscovery = page.waitForResponse(r =>
    r.url().includes("/api/models/discover")
  )
  await page.goto("/local/chat")
  await clientDiscovery
  const input = page.locator("textarea").first()
  await input.waitFor({ timeout: 30_000 })

  // Create a real, persisted, already-open chat (no need to wait for its
  // reply — the bug only requires an existing chat to be active).
  await input.click()
  await input.fill("existing chat marker")
  await input.press("Enter")
  await expect(
    page.locator('[data-message-role="user"]').getByText("existing chat marker")
  ).toBeVisible({ timeout: 10_000 })

  // Open the left "Agentes" panel and click the onboarding ("Sistema") row.
  await page.getByText("Configurações").click()
  await page.getByText("Agents").click()
  await page.getByText("Murici Helper").first().click()

  // Must NOT land on the knowledge home view (its header is "Conhecimento").
  await expect(page.getByText("Conhecimento")).toHaveCount(0)

  // The right "Detalhes" sidebar should be visible with the agent loaded —
  // proves we're on a real chat view (blank, brand-new chat, by design —
  // clicking an agent row always starts a new chat), not stuck behind the
  // knowledge/graph landing page with the sidebar force-closed.
  await expect(page.getByRole("heading", { name: "Detalhes" })).toBeVisible({
    timeout: 10_000
  })
  await expect(page.locator("textarea").first()).toBeVisible()
})
