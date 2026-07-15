/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { expect, test } from "@playwright/test"
import path from "path"
import {
  settleOnboarding,
  STREAM_HEADERS,
  CANNED_REPLY,
  toolCallReply
} from "../helpers/agent-chat"

/*
 * A `teach` effect carries either inline text or the NAME of a knowledge file
 * (`teach "recipes.txt"`). The name is useless to the model — it has no filesystem —
 * so resolveTeach() must swap it for the file's CONTENT before the state travels to
 * the model, both on the initial load and on every FSM advance.
 *
 * The regression this guards: the advance path resolved the name against an EMPTY
 * knowledge array, so the model received `teach: "recipes.txt"` and the Fridge
 * Assistant stopped being able to list any recipe. Caught by hand on
 * `examples/2. Fridge Assistant`, which is the fixture used here — its `responsive`
 * state has no teach, and `show_catalog` (one intent away) does, so only the ADVANCE
 * path can produce it.
 *
 * Model-free: the chat route is stubbed, so this asserts on exactly what the client
 * would have POSTed to the model.
 */

const FRIDGE_AGENT = path.resolve(
  __dirname,
  "../../../../dot-agent-spec/examples/2. Fridge Assistant.agent"
)

// A line that only exists inside knowledge/recipes.txt.
const RECIPE_CONTENT_MARKER = "Vegetable Stir-fry"

test("an FSM advance resolves `teach` to the knowledge file's content, not its name", async ({
  page
}) => {
  test.setTimeout(120_000)

  const bodies: any[] = []
  await page.route("**/api/chat/**", async route => {
    if (route.request().method() !== "POST") return route.continue()
    const body = route.request().postDataJSON()
    bodies.push(body)

    // First turn: make the model drive the FSM from `responsive` to `show_catalog`,
    // which is the state that carries `teach "recipes.txt"`. Take the intent name
    // from the request itself rather than hardcoding the agent's flow.
    const intents: string[] = body?.behaviorState?.validIntents ?? []
    const listRecipes = intents.find(i => /list recipes/i.test(i))
    const alreadyAdvanced = JSON.stringify(body.messages ?? []).includes(
      "trigger_intent"
    )

    if (listRecipes && !alreadyAdvanced) {
      await route.fulfill({
        status: 200,
        headers: STREAM_HEADERS,
        body: toolCallReply("trigger_intent", { intent_name: listRecipes })
      })
      return
    }

    await route.fulfill({
      status: 200,
      headers: STREAM_HEADERS,
      body: CANNED_REPLY
    })
  })

  await page.goto("/local/chat")
  await settleOnboarding(page)

  // A fresh thread for the Fridge agent — the onboarding agent owns the other one.
  await page.getByRole("button", { name: "Novo chat" }).click()

  // Two hidden .agent inputs exist (chat-input's pill and the right sidebar's empty
  // state); either one loads the bundle into the thread on screen.
  await page
    .locator('input[type="file"][accept=".agent"]')
    .first()
    .setInputFiles(FRIDGE_AGENT)

  // The agent is loaded once its FSM panel names the initial state.
  await expect(page.getByText("responsive").first()).toBeVisible({
    timeout: 30_000
  })

  const input = page.locator("textarea").first()
  await input.click()
  await input.fill("list the recipes")
  await input.press("Enter")

  // The tool result travels back to the model on the AUTOMATIC RESUBMIT, so wait for
  // the request that carries it.
  await expect
    .poll(
      () =>
        bodies.filter(b =>
          JSON.stringify(b.messages ?? []).includes("trigger_intent")
        ).length,
      { timeout: 60_000 }
    )
    .toBeGreaterThan(0)

  const resubmit = bodies
    .filter(b => JSON.stringify(b.messages ?? []).includes("trigger_intent"))
    .pop()

  const toolPart = (resubmit.messages as any[])
    .flatMap(m => m.parts ?? [])
    .find((p: any) => p.toolName === "trigger_intent" && p.output)

  expect(toolPart, "the trigger_intent tool result must reach the model").toBeTruthy()
  expect(toolPart.output.state).toBe("show_catalog")

  // THE ASSERTION. A bare file name here means the model was handed a path it cannot
  // read, and the agent silently loses its knowledge.
  expect(
    toolPart.output.teach,
    "teach must be the knowledge file's CONTENT, not its name"
  ).not.toBe("recipes.txt")
  expect(toolPart.output.teach).toContain(RECIPE_CONTENT_MARKER)

  // The same resolved knowledge must also be in the FSM state injected on the next
  // turn — the two are built from the same session, and this is what actually reaches
  // the prompt.
  expect(resubmit.behaviorState?.teach).toContain(RECIPE_CONTENT_MARKER)
})
