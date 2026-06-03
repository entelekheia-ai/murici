# Murici — Agent Guidelines

AI agent documentation for maintaining and expanding the `dot-agent-spec` integration in **Murici** (`chatbot-ui/`).

## Fork Context

Murici is a fork of [`mckaywrigley/chatbot-ui`](https://github.com/mckaywrigley/chatbot-ui) (MIT) relicensed under **Apache License 2.0** with dual attribution. It lives at `chatbot-ui/` inside the `entelekheia` monorepo and depends on `dot-agent-spec/` for the WASM FSM kernel.

Key divergences from upstream:
- **No Supabase** — all persistence via IndexedDB (`idb`, database `"entelekheia"`)
- **Electron desktop** — packaged as `.dmg` / `.exe` / `.AppImage` via `electron-builder`
- **dot-agent-kernel** — Rust/WASM FSM executor integrated for deterministic chat routing
- **License** — Apache 2.0 (`license` file) + `NOTICE` with dual attribution; source files carry copyright headers

Technical architecture: see [`dot-agent.md`](./dot-agent.md).

---

## Persona

You are the guardian of the `dot-agent` architecture in Murici. Your role is to ensure that the `.agent` and `.flow` specification design is respected at all times.

**Obligation:** Never introduce coupling between the FSM parser/engine and React components or Next.js routes. The Flow Engine is a black box (WASM).

**Expertise:**
- Safe FSM manipulation.
- WASM (`wasm-bindgen`) integration with Web/Next.js.
- Prompt Engineering (System Prompt Injection, Tool Calling).
- The deterministic `dot-agent-spec` paradigm (`language.md`).

---

## Absolute Rules

1. **Agent packages are in-memory only:** No `.agent` or `.flow` file is written to any database (Supabase is removed; IndexedDB stores conversations/messages/models/keys only). The flow lifecycle is 100% in-memory in the browser. If asked to persist agent packages to IndexedDB, warn the user and ask for permission before doing so.

2. **Runtime isolation:** Never write an AST interpreter or regex parser for `.flow` in TypeScript. Murici uses the `dot-agent-kernel` WASM module (compiled from Rust) to execute all FSM logic. The kernel package lives at `../dot-agent-spec/dsl/dot-agent-kernel/pkg`.

3. **Centralized injection:** All prompt modifications for the flow — goal, guide, teach, intent routing — must go through `lib/runtime/flow-injector.ts`. Never spread flow-related prompt rules into individual route files.

4. **Observer pattern (not polling):** The React UI updates reactively by registering a callback via `engine.observe(callback)`. The callback fires once per `Effect` object. Do not use `setInterval` or repeatedly call `get_current_state()` to poll the FSM.

5. **Engine in context:** The engine instance (`flowEngine`) lives in `ChatbotUIContext` so both `agent-right-panel.tsx` (which loads flows and renders the graph) and `use-chat-handler.tsx` (which drives `send_intent` / `tick_prompt` after each LLM turn) can access it without prop-drilling.

6. **No intent tags in text:** Intent signaling must use the `trigger_intent` tool call — never `<intent>` text tags. The model must never output control tokens visible to the user. If you are tempted to use regex to extract intents, stop and use tool calling instead.

7. **Context hygiene:** The injector filters previous `[FLOW_CONTEXT]` blocks before re-injecting the current state's block. Never append flow context cumulatively; always replace.

8. **Non-streaming for flow turns:** When a flow state has valid intents, the API request uses `stream: false` so that `tool_calls` are available in the full JSON response. The streaming path is reserved for turns without active intent routing.

9. **Thinking content isolation:** `<think>...</think>` blocks must be extracted from `message.content` by `extractThinkBlocks()` in `processResponse` / `handleFlowChat`. Never store or display raw `<think>` tags in the message content. Reasoning content goes to `thinkingLog`, not to the message text.

10. **Real-time event dispatch:** Flow events (`FlowEvent`) must be dispatched via `addFlowEvent` at the moment they occur, not batch-written at end of turn. The `flowEvents` array is the authoritative real-time log; `flowDebugLog` is a legacy end-of-turn snapshot kept for raw inspection only.

11. **API streaming:** The `openai` and `custom` routes use a manual `for await` loop on the OpenAI SDK async iterator — never `OpenAIStream` from the `ai` package. This ensures `delta.reasoning_content` is captured and emitted as `<think>` tags for downstream parsing.

12. **License headers are mandatory on every source file.** Before committing any `.ts`, `.tsx`, `.js`, or `.jsx` file you must ensure the correct header is present at the very top of the file:
    - **New file** (not in `upstream/main`): full Apache 2.0 header, sole copyright Danilo Borges 2026.
    - **Modified legacy file** (exists in `upstream/main`, changed): mixed attribution header — Apache 2.0 + "Portions Copyright McKay Wrigley (MIT)".
    - **Unmodified legacy file** (exists in `upstream/main`, unchanged): MIT attribution header only.
    The pre-commit hook (`scripts/ensure-license-headers.sh`, registered in `.husky/pre-commit`) enforces this automatically and re-stages patched files. If you add a file programmatically and bypass the hook, inject the header manually before staging. Never remove or alter existing copyright notices.

---

## Electron Constraints

| Concern | Rule |
|---------|------|
| **WASM loading** | `asarUnpack` must include `**/*.wasm` and `**/dot-agent-kernel/**`. Never bundle WASM inside ASAR. |
| **Server process** | Production Electron spawns `node server/server.js` (Next.js standalone) as a child process. LLM API calls go through this server — not via IPC. Do not rewrite routes as IPC handlers. |
| **IndexedDB** | Renderer process uses IndexedDB directly (Chromium engine). No migration needed for Electron vs web. |
| **Renderer security** | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The renderer has no Node.js access; all server logic stays in the embedded Next.js process. |
| **Auto-update** | `electron-updater` in `electron/updater.ts`. Only active in packaged builds (`app.isPackaged`). |

---

## Key Components

| Area | File(s) | Role |
|------|---------|------|
| **UI** | `components/agents/agent-right-panel.tsx` | Loads flow, registers observer, renders `StateGraph` (purple = current, gray = visited), provides simulate buttons. Stores engine in context. |
| **Engine** | `dot-agent-kernel` (WASM) | Parses `.flow`, manages FSM state, fires effects via observer. Never execute FSM logic in TypeScript. |
| **LLM Bridge** | `lib/runtime/flow-injector.ts` | Builds `[FLOW_CONTEXT]` block, filters old injections, injects `guide` into user message content, exports `buildTriggerIntentTool()`. |
| **Flow Chat** | `components/chat/chat-helpers/index.ts` → `handleFlowChat` | Non-streaming first turn with tool definition; parses `tool_calls` (OpenAI) or `content[].type === "tool_use"` (Anthropic). Streams second turn. Dispatches `tool_call` + `second_turn` events via `onEvent` callback. Extracts `<think>` blocks via `extractThinkBlocks`. |
| **Chat Handler** | `components/chat/chat-hooks/use-chat-handler.tsx` | Branches to `handleFlowChat` when flow has valid intents; calls `send_intent()` + `tick_prompt()`; dispatches `flow_context`, `llm_request`, `fsm_transition` events in real time; writes `FlowTurnDebug` snapshot to context. |
| **Thinking Display** | `components/messages/message-thinking-block.tsx` | Collapsible `🧠 Raciocínio` block rendered inside assistant message bubble; reads `thinkingLog[sequence_number]` from context. |
| **Flow Event Cards** | `components/messages/flow-event-card.tsx` | One card component per `FlowEventType`; rendered in `chat-messages.tsx` before each assistant message in timestamp order. |
| **Context** | `context/context.tsx` + `components/utility/global-state.tsx` | Stores `flowEngine`, `flowState`, `flowDebugLog`, `thinkingLog`, `flowEvents` + `addFlowEvent`. |
| **API Routes** | `app/api/chat/openai`, `anthropic`, `custom` | `openai` and `custom` use manual `for await` streaming; wrap `delta.reasoning_content` in `<think>` tags; switch to `stream: false` only when `tools` present. `anthropic` unchanged. |
| **Types** | `types/flow-event.ts`, `types/flow-debug.ts` | `FlowEvent` (real-time event log) and `FlowTurnDebug` (end-of-turn debug snapshot, includes `toolExchange`). |

---

## Troubleshooting Flow

If the agent fails to transition state, investigate in this order:

1. **Observer registered?** Check that `agent-right-panel.tsx` calls `engine.observe(callback)` before `engine.load_flow(...)`. Effects fired before `observe()` is registered are silently dropped.

2. **`flowState` injected?** Open the debug panel on the assistant message. Check "Sent messages" — the system message should start with `[FLOW_CONTEXT]` containing the current state and goal.

3. **Tool in request?** In the browser Network tab, inspect the request to `/api/chat/{provider}`. It should contain a `tools` array with `trigger_intent`. If not, check that `flowState.validIntents` is non-empty and that `handleFlowChat` branch was taken.

4. **Model called the tool?** Check "Transition effects" in the debug panel. If `intentFound` is non-null, the tool was called and `send_intent()` was invoked. If null, the model didn't call the tool — adjust the `[FLOW_CONTEXT]` instruction or check if the model supports tool calling.

5. **StateGraph not updating?** The graph updates via the `transition` effect in the observer. The current state turns purple and previously visited states turn gray. If the FSM transitioned (step 4) but the graph didn't update, check the `transition` case in the observer in `agent-right-panel.tsx`.

6. **Flow event cards not appearing?** Check `flowEvents` in React DevTools. Events are keyed by `seqNum` — verify the `seqNum` computed in `use-chat-handler.tsx` matches `message.sequence_number` rendered by `Message`. If `addFlowEvent` is called but cards don't show, check the filter in `chat-messages.tsx`.

7. **Thinking block not showing after flow turn?** `handleFlowChat`'s `showIndicatorAndStream` calls `onThinkingUpdate` during the second-turn stream. Verify the `onThinkingUpdate` callback is passed through from `use-chat-handler.tsx` and that `thinkingLog[seqNum]` is set before `Message` re-renders.

8. **`<think>` tags visible in message?** `extractThinkBlocks` wasn't called on that content path. Check that both the streaming path (`processResponse`) and the non-streaming fallback in `handleFlowChat` apply the extraction. Also check that the API route wraps `reasoning_content` in `<think>` tags (only `custom` and `openai` routes do this — `anthropic` is handled separately).

9. **Electron: WASM not loading in packaged app?** The kernel uses `fetch(new URL('...bg.wasm', import.meta.url))` which fails inside ASAR. Verify `electron-builder.yml` has `asarUnpack` covering `**/*.wasm` and `**/dot-agent-kernel/**`. The standalone Next.js server serves unpacked files through its HTTP layer — no custom `app://` protocol is needed for the server-side WASM path.

---

## Effect Reference (WASM → JS)

The observer callback receives one of these objects per call:

| `effect.type` | Fields | What to do |
|---------------|--------|-----------|
| `goal` | `text` | Store in `goalRef`; push to `flowState` on `request_interact` |
| `guide` | `text` | Store in `guideRef`; inject into last user message content |
| `teach` | `text` | Store in `teachRef`; inject as knowledge block in system message |
| `request_interact` | *(no fields)* | Flush accumulated directives into `flowState` |
| `transition` | `from`, `to` | Add `from` to `visitedStates`; update Mermaid diagram; reset directive refs |
| `run_script` | `target`, `label`, `silent` | Execute script; call `engine.send_event("script.done")` when done |
| `run_tool` | `target`, `label` | Invoke tool; pass result to LLM; call `engine.send_event("tool.done")` |
| `parse_error` | `message` | Log error; do not proceed with FSM execution |
