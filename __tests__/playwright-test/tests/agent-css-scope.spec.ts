/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { test, expect, Page } from "@playwright/test"
import { CANNED_REPLY, settleOnboarding, sse, STREAM_HEADERS } from "../helpers/agent-chat"

/*
 * Regression guard for project/plans/017 (per-thread presentation-effects
 * pipeline). The onboarding agent applies CSS via `apply css` while its FSM
 * advances. Before this pipeline, that CSS was injected straight into
 * document.head with no per-thread scoping and no teardown on chat switch —
 * once applied, it stayed applied even after navigating away to a completely
 * different, agent-less chat.
 *
 * This exercises the OFF-SCREEN path specifically — per the ADR-0007 gotcha
 * in project_murici_channels: opening the onboarding chat and sending a
 * message alone does NOT catch this class of bug, because the chat you're
 * sending from is also the chat on screen, so a buggy "apply globally, never
 * scope" implementation and the correct one look identical. The bug only
 * shows when the onboarding thread's FSM advances — and applies CSS — WHILE a
 * DIFFERENT chat is the one on screen. Mirrors the off-screen synchronization
 * pattern in channel-agent-isolation.spec.ts.
 *
 * Both chats involved are switched to via their PERSISTED sidebar rows, never
 * via "Novo chat" mid-test — "Novo chat" calls handleNewChat(), which stop()s
 * whatever chat is currently streaming, which would abort the very
 * background advance this test needs to observe.
 */

function cssLinkIds(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('link[id^="dot-agent-css:"]')).map(
      link => link.id
    )
  )
}

test("switching away from the onboarding chat while its CSS effect lands off-screen does not leak it, and switching back restores it", async ({
  page
}) => {
  test.setTimeout(120_000)

  let signalFirstRequest: () => void
  const firstRequestSeen = new Promise<void>(res => {
    signalFirstRequest = res
  })
  let signalSwitched: () => void
  const switchedAway = new Promise<void>(res => {
    signalSwitched = res
  })

  const bodies: any[] = []
  // Hold the FIRST request that carries an agent's FSM state — not simply
  // "request #1" — because chat #2 (agent-less) is deliberately created and
  // sent from BEFORE the onboarding chat's held send, to have it available as
  // an already-persisted switch target.
  let holdNextAgentRequest = true
  await page.route("**/api/chat/**", async route => {
    if (route.request().method() !== "POST") return route.continue()
    const body = route.request().postDataJSON()
    bodies.push(body)

    const intents: string[] = body?.behaviorState?.validIntents ?? []

    // The onboarding chat's send: hold the response until the test has
    // navigated away, THEN deliver a trigger_intent that advances it to
    // welcome.agent_format — a state whose FSM effects include
    // `apply css "agents.css"`. The advance, and the CSS effect it carries,
    // happen entirely off-screen (the tool call runs against this thread's
    // own kernel regardless of what's on screen — ADR-0007).
    if (holdNextAgentRequest && intents.length > 0) {
      holdNextAgentRequest = false
      signalFirstRequest()
      await switchedAway
      return route.fulfill({
        status: 200,
        headers: STREAM_HEADERS,
        body: sse(
          { type: "start" },
          { type: "start-step" },
          {
            type: "tool-input-available",
            toolCallId: "call_advance_css_1",
            toolName: "trigger_intent",
            input: { intent_name: intents[0] },
            dynamic: true
          },
          { type: "finish-step" },
          { type: "finish" }
        )
      })
    }

    await route.fulfill({ status: 200, headers: STREAM_HEADERS, body: CANNED_REPLY })
  })

  await page.goto("/local/chat")
  await settleOnboarding(page)

  // No CSS applied yet: the onboarding chat's initial state ("welcome") only
  // REMOVES stylesheets on load, it doesn't apply any.
  expect(await cssLinkIds(page)).toEqual([])

  // ---- Create and persist chat #2 (agent-less) FIRST, via "Novo chat" + a
  // completed send. Doing this now (not via a held request later) is exactly
  // what sidesteps the "Novo chat aborts the current stream" trap.
  await page.getByRole("button", { name: "Novo chat" }).click()
  await expect(page.locator("[data-message-id]")).toHaveCount(0)
  const plainInput = page.locator("textarea").first()
  await plainInput.click()
  await plainInput.fill("chat sem agente")
  await plainInput.press("Enter")
  await expect(
    page.locator('[data-message-role="user"]').getByText("chat sem agente")
  ).toBeVisible({ timeout: 15_000 })

  // ---- Switch BACK to the onboarding chat via its persisted sidebar row.
  await page
    .locator("div.truncate", { hasText: "Bem-vindo ao Murici" })
    .first()
    .click()
  await expect(
    page.getByRole("heading", { name: "Histórico de Estados" })
  ).toBeVisible({ timeout: 15_000 })

  // ---- Send from the onboarding chat, and leave its reply hanging.
  const input = page.locator("textarea").first()
  await input.click()
  await input.fill("continua o tour")
  await input.press("Enter")
  await firstRequestSeen

  // ---- Switch to chat #2 via ITS OWN persisted sidebar row — not "Novo
  // chat", which would abort the onboarding chat's held request instead of
  // letting it advance in the background.
  const bodiesBeforeAdvance = bodies.length
  await page
    .locator("div.truncate", { hasText: "chat sem agente" })
    .first()
    .click()
  await expect(
    page.locator('[data-message-role="user"]').getByText("chat sem agente")
  ).toBeVisible({ timeout: 15_000 })

  // Release the held response: the onboarding thread's trigger_intent runs
  // now, entirely in the background, applying "agents.css" to a thread
  // nobody is looking at.
  signalSwitched!()

  // Wait for the automatic tool-result resubmit — observable proof the
  // trigger_intent advance (and the CSS effect it carried) has been processed.
  await expect
    .poll(() => bodies.length, { timeout: 30_000 })
    .toBeGreaterThan(bodiesBeforeAdvance)
  // Give the store update + KernelPresentationHost reconciler effect a moment to run.
  await page.waitForTimeout(500)

  // THE LEAK, if it existed: chat #2, on screen, would now carry the
  // background onboarding chat's theme.
  expect(
    await cssLinkIds(page),
    "the agent-less chat on screen must not inherit the background chat's CSS"
  ).toEqual([])

  // ---- Switch back to the onboarding chat.
  await page
    .locator("div.truncate", { hasText: "Bem-vindo ao Murici" })
    .first()
    .click()
  await expect(
    page.getByRole("heading", { name: "Histórico de Estados" })
  ).toBeVisible({ timeout: 15_000 })

  // Its theme must reappear — the "reactivate on return" half of the fix.
  await expect
    .poll(() => cssLinkIds(page), { timeout: 15_000 })
    .toEqual(["dot-agent-css:agents.css"])
})
