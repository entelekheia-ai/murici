/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { test, expect } from "@playwright/test"
import {
  CANNED_REPLY,
  settleOnboarding,
  sse,
  STREAM_HEADERS
} from "../helpers/agent-chat"

/*
 * Regression guard for the per-thread channel refactor (ADR-0007).
 *
 * Asserts on the REQUEST BODY the client actually POSTs — which is exactly where
 * both root causes lived — so this needs no model server and is deterministic: the
 * chat route is stubbed with a canned AI-SDK UI-message stream.
 *
 *   1. "offtopic" leak: a chat with a .agent used to publish its FSM state
 *      (behaviorState + persona) to GLOBAL context, so the NEXT chat's request
 *      carried the previous agent's allowed_intents and the model answered the user
 *      as if they had gone off-topic. An agent-less chat's request must carry no
 *      behaviorState and no agentPersona.
 *
 *   2. Background streams: starting a new chat no longer aborts the previous one.
 *      Its reply must keep arriving, stay out of the chat on screen, and be waiting
 *      in the chat that actually sent it.
 */


test("a chat with no agent never carries the previous chat's FSM state", async ({
  page
}) => {
  test.setTimeout(120_000)

  const bodies: any[] = []
  await page.route("**/api/chat/**", async route => {
    if (route.request().method() !== "POST") return route.continue()
    bodies.push(route.request().postDataJSON())
    await route.fulfill({ status: 200, headers: STREAM_HEADERS, body: CANNED_REPLY })
  })

  await page.goto("/local/chat")
  await settleOnboarding(page)

  // ---- Send from the chat that HAS the agent.
  const input = page.locator("textarea").first()
  await input.click()
  await input.fill("mensagem no chat com agente")
  await input.press("Enter")

  await expect.poll(() => bodies.length, { timeout: 30_000 }).toBeGreaterThan(0)

  const agentBody = bodies[bodies.length - 1]
  expect(
    agentBody.behaviorState,
    "the agent's own chat must carry its FSM state"
  ).toBeTruthy()
  expect(agentBody.behaviorState.currentState).toBeTruthy()

  // ---- The bug: leave that chat, start a NEW one (no agent), send.
  const before = bodies.length
  await page.getByRole("button", { name: "Novo chat" }).click()
  await expect(page.locator("[data-message-id]")).toHaveCount(0)

  const input2 = page.locator("textarea").first()
  await input2.click()
  await input2.fill("mensagem no chat sem agente")
  await input2.press("Enter")

  await expect
    .poll(() => bodies.length, { timeout: 30_000 })
    .toBeGreaterThan(before)

  const plainBody = bodies[bodies.length - 1]
  // Before ADR-0007 this carried the PREVIOUS chat's agent, and the model duly
  // replied that the message was off-topic. An agent must not follow the user out
  // of its own chat.
  expect(
    plainBody.behaviorState,
    "an agent-less chat must not carry the previous chat's FSM state"
  ).toBeFalsy()
  expect(
    plainBody.agentPersona,
    "an agent-less chat must not carry the previous chat's persona"
  ).toBeFalsy()
})

test("a BACKGROUND chat advances its OWN agent, while a different agent chat is on screen", async ({
  page
}) => {
  test.setTimeout(120_000)

  // This is the scenario that actually discriminates the bug, and it is the one the
  // user hit: an agent chat is still working while ANOTHER chat is on screen.
  //
  // The old code kept the FSM in globals (context.flowEngine / context.flowState)
  // that always tracked the chat being VIEWED. So when chat #1's tool call landed
  // after the user had moved to chat #2:
  //   - trigger_intent advanced the GLOBAL kernel — i.e. chat #2's agent, not #1's;
  //   - and chat #1's follow-up request was built from the GLOBAL flowState — i.e.
  //     chat #2's agent state.
  // That is precisely how a message could come back answered by the wrong agent
  // ("offtopic"). Under ADR-0007 each channel reads its OWN session, so neither can
  // happen.
  //
  // (Merely opening a second agent chat and sending would NOT catch the regression:
  // opening it repoints the global at that chat's session, so the buggy code and the
  // fixed code agree. The bug only shows while a chat works OFF-SCREEN.)

  const bodies: { id: string; behaviorState?: any; agentPersona?: string }[] = []

  let signalFirstRequest: () => void
  const firstRequestSeen = new Promise<void>(res => {
    signalFirstRequest = res
  })
  let signalSwitched: () => void
  const switchedAway = new Promise<void>(res => {
    signalSwitched = res
  })

  let served = 0
  await page.route("**/api/chat/**", async route => {
    if (route.request().method() !== "POST") return route.continue()
    const body = route.request().postDataJSON()
    bodies.push(body)
    served += 1

    const intents: string[] = body?.behaviorState?.validIntents ?? []

    // Chat #1's very first send: hold the response until the test has navigated
    // away to chat #2, THEN deliver a trigger_intent. So the tool call is executed,
    // and the follow-up request is built, while chat #1 is OFF-SCREEN.
    if (served === 1 && intents.length > 0) {
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
            toolCallId: "call_advance_1",
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

  // ---- Chat #1 (the onboarding agent chat): send, and leave it hanging.
  const input = page.locator("textarea").first()
  await input.click()
  await input.fill("avanca o fluxo")
  await input.press("Enter")

  await firstRequestSeen
  const firstThreadId = bodies[0].id
  const initialState = bodies[0].behaviorState?.currentState
  expect(initialState, "chat #1 must start at its agent's FSM state").toBeTruthy()

  // ---- Chat #2: open the same agent from the Agentes panel — always a brand-new
  // chat, and therefore a brand-new, INDEPENDENT agent session/kernel.
  // Role-scoped: an environment error toast ("… Verifique em Configurações") also
  // contains that word, so a bare text match would be ambiguous.
  await page.getByRole("button", { name: "Configurações" }).click()
  await page.getByRole("menuitem", { name: "Agents" }).click()
  await page.getByText("Murici Helper").first().click()
  // "Detalhes" is only the button that opens the panel when closed (header.tsx);
  // it disappears once open. "Histórico de Estados" is the agent-detail panel's
  // own unconditional heading — see settleOnboarding in helpers/agent-chat.ts.
  await expect(
    page.getByRole("heading", { name: "Histórico de Estados" })
  ).toBeVisible({ timeout: 15_000 })

  // Chat #2 is now the chat on screen. Release chat #1's tool call: it will run in
  // the BACKGROUND, against a kernel nobody is looking at.
  signalSwitched!()

  // Chat #1 must follow up (the automatic tool-result resubmit) with ITS OWN,
  // advanced state — built entirely off-screen.
  await expect
    .poll(
      () => bodies.filter(b => b.id === firstThreadId).length,
      { timeout: 30_000 }
    )
    .toBeGreaterThan(1)

  const followUp = bodies.filter(b => b.id === firstThreadId)[1]
  expect(
    followUp.behaviorState?.currentState,
    "the background chat's follow-up must carry the state ITS OWN kernel advanced to"
  ).not.toBe(initialState)

  // ---- And chat #2's kernel must be untouched by all of that: send from it and
  // check it is still at the initial state. On the old code trigger_intent ran
  // against the global (= viewed) kernel, so chat #2's agent would have been the one
  // that moved.
  const before = bodies.length
  const input2 = page.locator("textarea").first()
  await input2.click()
  await input2.fill("mensagem no segundo agente")
  await input2.press("Enter")

  await expect
    .poll(() => bodies.length, { timeout: 30_000 })
    .toBeGreaterThan(before)

  const secondBody = bodies[bodies.length - 1]
  expect(secondBody.id, "chat #2 must be its own thread").not.toBe(firstThreadId)
  expect(
    secondBody.behaviorState?.currentState,
    "chat #2's agent must NOT have been advanced by chat #1's background tool call"
  ).toBe(initialState)
})

test("starting a new chat does not abort the previous reply, and it lands in the chat that sent it", async ({
  page
}) => {
  test.setTimeout(120_000)

  let releaseHeld: () => void
  const held = new Promise<void>(res => {
    releaseHeld = res
  })
  let seen = 0

  await page.route("**/api/chat/**", async route => {
    if (route.request().method() !== "POST") return route.continue()
    seen += 1
    // Hold only the first send, so we can walk away while it is still in flight.
    if (seen === 1) await held
    await route.fulfill({ status: 200, headers: STREAM_HEADERS, body: CANNED_REPLY })
  })

  await page.goto("/local/chat")
  await settleOnboarding(page)

  // Start from a clean, agent-less thread so the onboarding chat is not in play.
  await page.getByRole("button", { name: "Novo chat" }).click()
  await expect(page.locator("[data-message-id]")).toHaveCount(0)

  const input = page.locator("textarea").first()
  await input.click()
  await input.fill("primeira conversa")
  await input.press("Enter")
  await expect(
    page.locator('[data-message-role="user"]').getByText("primeira conversa")
  ).toBeVisible({ timeout: 15_000 })

  // Walk away mid-stream. Before channels, handleNewChat() called stop() and this
  // reply was simply killed.
  await page.getByRole("button", { name: "Novo chat" }).click()
  await expect(page.locator("[data-message-id]")).toHaveCount(0)

  // The chat we left is still generating — and the sidebar row says so. This is the
  // affordance that replaced the old abort.
  await expect(page.locator('[data-generating="true"]').first()).toBeVisible({
    timeout: 15_000
  })

  // Let it finish while we are looking at the new, empty chat.
  releaseHeld!()

  // It must NOT bleed into the chat on screen.
  await page.waitForTimeout(2500)
  await expect(page.locator("[data-message-id]")).toHaveCount(0)

  // And it must be waiting for us, complete, in the chat that actually sent it.
  await page
    .locator("div.truncate", { hasText: "primeira conversa" })
    .first()
    .click()
  await expect(
    page.locator('[data-message-role="user"]').getByText("primeira conversa")
  ).toBeVisible()
  await expect(page.getByRole("paragraph").getByText("pong")).toBeVisible({
    timeout: 15_000
  })
})
