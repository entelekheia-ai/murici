---
name: verify
description: 'Use when about to claim a murici UI or chat change works, when writing a Playwright spec for chat, channel or agent behaviour, or when a spec passes alone and fails inside its file. Drives the browser build with Playwright against a stubbed model.'
---

<!-- vibe-ops-template: skill@1 -->

# Verify a murici change in the browser

Fires when a UI or chat change is about to be called done. At the end, a Playwright spec exercises the
change against the browser build, and it has been seen to fail on the old behaviour.

**This is a target-state skill.** Re-running it re-checks the same change; a spec that already exists is
extended or repaired, never duplicated.

Electron cannot be driven headlessly, so the target is the browser build: `playwright.config.ts`'s
`webServer` starts `npm run dev` on `localhost:3000` when nothing listens there. Run one spec with
`npx playwright test <file> --project=chromium --reporter=list`.

## Step 1 — Stub the model route

For anything client-side — channels, agent/FSM binding, message routing, the request body — stub
`/api/chat/**` and the test is deterministic and needs no model server:

```ts
await page.route("**/api/chat/**", async route => {
  if (route.request().method() !== "POST") return route.continue()
  const body = route.request().postDataJSON()   // assert on THIS
  await route.fulfill({ status: 200, headers: STREAM_HEADERS, body: CANNED_REPLY })
})
```

Import the wire format from `__tests__/playwright-test/helpers/agent-chat.ts` (`sse`, `STREAM_HEADERS`,
`CANNED_REPLY`, `toolCallReply`, `settleOnboarding`) instead of re-deriving it. If you must build a body by
hand: `content-type: text/event-stream` plus `x-vercel-ai-ui-message-stream: v1`, each part as
`data: ${JSON.stringify(part)}\n\n`, closed by `data: [DONE]\n\n`; parts are `start`, `start-step`,
`text-start {id}`, `text-delta {id, delta}`, `text-end {id}`, `finish-step`, `finish`.

- **Force a tool call** to move an agent's FSM:
  `{type:"tool-input-available", toolCallId, toolName:"trigger_intent", input:{intent_name}, dynamic:true}`.
  `dynamic: true` is what makes the SDK call `onToolCall`. Take a valid intent from the request
  (`body.behaviorState.validIntents`) rather than hard-coding the agent's flow.
- **Hold a reply open** (the switch-chats-mid-stream race) by resolving a promise from the handler, never
  by racing a timer against a real model:

  ```ts
  let release: (() => void) | null = null
  await page.route("**/api/chat/**", async route => {
    if (hold) { hold = false; await new Promise<void>(r => { release = r }) }
    await route.fulfill({ status: 200, headers: STREAM_HEADERS, body: CANNED_REPLY })
  })
  ```

- **Delay a real reply** instead, when the backend is wanted: `setTimeout` inside the handler, then
  `route.continue()`.

## Step 2 — Assert on the request, then on the page

The agent binding travels in the request body — `behaviorState`, `agentPersona`, and `id` (the thread
id) — so an assertion there is sharper than reading the UI. Worked example:
`__tests__/playwright-test/tests/channel-agent-isolation.spec.ts`.

On the page, use these hooks; text matches collide with the right sidebar and with error toasts:

| Target | Selector |
|---|---|
| A chat message | `[data-message-id]`, `[data-message-role="user"\|"assistant"\|"system"]` (`components/messages/message.tsx`) |
| A sidebar chat still streaming | `[data-generating="true"]` (`components/sidebar/items/chat/chat-item.tsx`) |
| A sidebar chat row | `div.truncate` holding the chat name — the first message cut to 50 characters (`lib/channels/channel-controller.ts`) |
| Left "Agentes" panel | `getByRole("button", { name: "Configurações" })`, then `getByRole("menuitem", { name: "Agents" })` — roles, because a toast also says "Configurações" |
| New chat | `getByRole("button", { name: "Novo chat" })` — it calls `stop()` and **aborts** the chat being left |
| Home `.agent` input | click `getByText("Iniciar um .agent")`, await `page.waitForEvent("filechooser")` |
| Left the knowledge home | `getByText("Conhecimento")` has count 0 |

The graph-home landing view starts with the left sidebar **closed**: click the textarea first. To test
switching between chats while one streams, use two persisted chats and their sidebar rows, never
"Novo chat". Pick a model with
`page.addInitScript(id => localStorage.setItem("murici_selected_model", id), modelId)` before `goto`; an
unknown id is replaced by the first discovered model at startup.

## Step 3 — Settle the onboarding agent first

On a fresh profile the app loads the onboarding `.agent` into the visible thread and persists it as a
chat — so a spec passes alone and fails inside its file. Treat it as a precondition: wait for the
"Detalhes" heading and the "Bem-vindo ao Murici" sidebar row (`settleOnboarding()`), and reuse that chat
as your known chat-with-an-agent.

## Step 4 — Prove the spec can fail

Simulate the old bug and watch the spec go red before trusting green. A cross-chat leak discriminates
only on the **off-screen** path: sending in a second chat re-points the global state at that chat, so
buggy and fixed code agree. Advance one chat's FSM while a **different** chat is on screen — hold the
first reply, navigate away, then deliver the tool call.

## Step 5 — Keep real models to smoke tests

Never assert behaviour against a real local model: a small quantized model emits a malformed tool call
(`name: "unknown"`, `arguments` as a list), its server 422s the next turn, and the fixture's
`console.error` guard fails the spec on the model's fault. `random-model-smoke.spec.ts` and
`chat-tool-calling.spec.ts` need an OpenAI-compatible server with a model loaded: discover it through
`GET /api/models/discover`, `test.skip(!model, …)` when none, and allow 180 s for a lazy first load.

**Those specs skip silently without a server, so a green suite says little.** Ask for the server to be
started before claiming the suite passes.

## Checklist

- [ ] The model route is stubbed, unless the spec is a smoke test
- [ ] The spec asserts on the request body where the binding lives
- [ ] Onboarding is settled before the spec's own steps
- [ ] The spec was seen failing on the old behaviour
- [ ] A suite reported green says whether the local-model specs ran or skipped
