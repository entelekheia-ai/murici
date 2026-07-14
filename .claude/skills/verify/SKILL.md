---
name: verify
description: How to verify a murici UI/chat change end-to-end via Playwright (browser mode, not Electron)
---

# Verifying murici changes

murici is a Next.js app (also packaged as Electron, but Electron isn't
drivable headlessly in this sandbox — no GUI, see feedback_bash_sandboxed_no_gui
in memory). For UI/chat behavior, drive the **browser** build with Playwright
instead: `npx playwright test <file> --project=chromium --reporter=list`.
`playwright.config.ts`'s `webServer` auto-starts `npm run dev` on
`localhost:3000` if nothing is already listening there (checked before
retrying: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`).

## Prefer a STUBBED model — it is deterministic and needs no server

For anything about **client-side** chat behavior (channels, agent/FSM binding,
message routing, the request body), do **not** depend on a real model. Stub the
route and you get a deterministic test that runs anywhere:

```ts
await page.route("**/api/chat/**", async route => {
  if (route.request().method() !== "POST") return route.continue()
  const body = route.request().postDataJSON()   // <-- assert on THIS
  await route.fulfill({
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "x-vercel-ai-ui-message-stream": "v1"
    },
    body: parts.map(p => `data: ${JSON.stringify(p)}\n\n`).join("") + "data: [DONE]\n\n"
  })
})
```

Stream parts (AI SDK v5): `{type:"start"}`, `{type:"start-step"}`,
`{type:"text-start",id}`, `{type:"text-delta",id,delta}`, `{type:"text-end",id}`,
`{type:"finish-step"}`, `{type:"finish"}`.

**To force a tool call** (e.g. drive an agent's FSM forward):
`{type:"tool-input-available", toolCallId, toolName:"trigger_intent", input:{intent_name}, dynamic:true}`
— **`dynamic: true` is what makes the SDK invoke `onToolCall`**. Discover a valid
intent name from the request itself (`body.behaviorState.validIntents`) instead of
hardcoding the agent's flow.

The request body is where the agent binding lives (`behaviorState`, `agentPersona`,
and `id` = the threadId), so asserting on it is usually a sharper test than reading
the UI. Worked example: `__tests__/playwright-test/tests/channel-agent-isolation.spec.ts`.

Shared helpers live in `__tests__/playwright-test/helpers/agent-chat.ts` (`sse`,
`STREAM_HEADERS`, `CANNED_REPLY`, `toolCallReply`, `settleOnboarding`) — import
them instead of re-deriving the wire format.

**To hold a reply open** (the "switch chats mid-stream" race), resolve a promise
from the route handler rather than racing a timer against a real model:

```ts
let release: (() => void) | null = null
await page.route("**/api/chat/**", async route => {
  if (hold) { hold = false; await new Promise<void>(r => { release = r }) }
  await route.fulfill({ status: 200, headers: STREAM_HEADERS, body: CANNED_REPLY })
})
```

## Traps that cost real time here

1. **The onboarding agent RACES your test.** On a fresh profile the app auto-loads
   the onboarding `.agent` into the thread on screen and persists it as a chat. This
   caused a test to pass alone and fail inside its own file. Treat it as an explicit
   **precondition** (wait for the "Detalhes" heading + the "Bem-vindo ao Murici"
   sidebar row) and reuse it as your known "chat with an agent" — see
   `settleOnboarding()` in the spec above.

2. **A cross-chat leak test only discriminates on the OFF-SCREEN path.** Opening a
   second agent chat and sending re-points the global state at that chat's session,
   so buggy and fixed code agree and the test passes either way. The bug only shows
   when one chat advances its FSM **while a different chat is on screen** (hold the
   first response, navigate away, then deliver the tool call). Always prove a
   regression test can fail — simulate the old bug and watch it go red.

3. **Do NOT write a behavior test against a real local model.** A small quantized
   model (e.g. Llama-3.2-1B) reliably emits a malformed tool call — `name: "unknown"`,
   `arguments` as a JSON **list** — and its own server then 422s the next turn. A spec
   that streams a real reply goes red on the model's behavior, not the app's, and the
   fixture's `console.error` guard turns that into a failure. Stub the route; keep real
   models only for smoke tests that just assert "a reply appeared".

## Local model server

`random-model-smoke.spec.ts` and `chat-tool-calling.spec.ts` need a local
OpenAI-compatible server (oMLX/Ollama/etc.) up with a model loaded. Check via
`GET /api/models/discover`; skip cleanly if nothing is discovered
(`test.skip(!model, "...")`). **Give it a generous timeout** (180s) — the model may
load lazily into RAM on the very first request.

⚠️ These specs **skip silently** when no server is running, so a green run means
much less than it looks. Ask the user to start the server before claiming the suite
passes — the first time they did, three long-skipped specs ran and found two real
bugs (a duplicate chat row and the `teach` regression).

## Useful selectors / hooks discovered

- Chat messages: `[data-message-id]` / `[data-message-role="user"|"assistant"|"system"]`
  on the wrapping div in `components/messages/message.tsx` — far more
  reliable than text/paragraph matching, which also matches the right
  sidebar's own unrelated `<p>` tags (agent description, state history).
- "This chat is still generating" spinner on a sidebar row:
  `[data-generating="true"]` (`components/sidebar/items/chat/chat-item.tsx`) — this
  is how you assert a chat kept streaming in the background after you navigated away.
- Opening the left "Agentes" panel: `page.getByRole("button", { name: "Configurações" })`
  then `page.getByRole("menuitem", { name: "Agents" })`. **Use roles, not text**: an
  environment error toast ("… Verifique em Configurações") also contains that word and
  makes a bare text match ambiguous.
- On the graph-home landing view the left sidebar is **closed**. Click the textarea
  first (that leaves the view and opens the sidebar) before reaching for anything in it.
- Sidebar chat row title: `div.truncate` containing `chat.name` (the sent
  message, truncated to 50 chars — see `handleSendMessage` in
  `chat-handler-provider.tsx`).
- "Novo chat" button: `page.getByRole("button", { name: "Novo chat" })`.
  **Gotcha:** this calls `handleNewChat()`, which calls `stop()` on the
  current stream — it *aborts* whatever chat you're leaving. To test
  "switch to a different EXISTING chat while another streams in the
  background" (no abort), you need two already-persisted chats and switch
  between them via their sidebar rows, not via "Novo chat".
- Home screen's hidden `.agent` file input: click the visible pill
  (`page.getByText("Iniciar um .agent")`) and assert via
  `page.waitForEvent("filechooser")` — Chromium's native file dialog never
  actually renders headlessly, but Playwright still fires this event when
  the underlying `<input type=file>.click()` executes.
- Left "Agentes" panel: open via `page.getByText("Configurações").click()`
  then `page.getByText("Agents").click()` (dropdown item). The onboarding
  agent's row text is its `aboutme.name` (e.g. "Murici Helper" in this repo).
- KnowledgeHomeView's unique marker text: its `<Header title="Conhecimento">`
  — assert `page.getByText("Conhecimento")` has count 0 to prove you landed
  on the chat view instead of the knowledge/graph home.
- To control timing for a "switch mid-stream" test without faking the AI
  SDK v5 wire protocol: `page.route("**/api/chat/**", ...)` and
  `await new Promise(r => setTimeout(r, N))` before `route.continue()` —
  proxies to the real backend, just delayed, so you get deterministic race
  timing with zero protocol-format risk. (If you ever do need to fake the
  stream body directly: headers are `content-type: text/event-stream` +
  `x-vercel-ai-ui-message-stream: v1`; each chunk is
  `data: ${JSON.stringify(part)}\n\n`, terminated by `data: [DONE]\n\n`;
  parts are `{type:"start"}`, `{type:"start-step"}`,
  `{type:"text-start", id}`, `{type:"text-delta", id, delta}`,
  `{type:"text-end", id}`, `{type:"finish-step"}`, `{type:"finish"}` — see
  `node_modules/ai/dist/index.js` around `JsonToSseTransformStream` /
  `UI_MESSAGE_STREAM_HEADERS`.)
- Model selection for a test: `page.addInitScript(id => localStorage.setItem("murici_selected_model", id), modelId)`
  before `page.goto`. Note `GlobalState`'s startup effect overrides an
  unknown/fake model id with the first real discovered one — so you can't
  force routing to `/api/chat/custom` this way if a real local model is
  actually available; just use the real discovered model id instead.

## Example specs

`__tests__/playwright-test/tests/verify-chat-isolation.spec.ts` and
`verify-agent-panel-and-home-input.spec.ts` (added while fixing the
July 2026 chat-bleed/agent-panel/home-input bugs) are worked examples of
all of the above.