# Murici — Agent Guidelines

AI agent documentation for maintaining and expanding the `dot-agent-spec` integration in **Murici** (`chatbot-ui/`).

## Fork Context

Murici is a fork of [`mckaywrigley/chatbot-ui`](https://github.com/mckaywrigley/chatbot-ui) (MIT) relicensed under **Apache License 2.0** with dual attribution. It lives at `chatbot-ui/` inside the `entelekheia` monorepo and depends on `dot-agent-spec/` for the WASM FSM kernel.

Key divergences from upstream:
- **No Supabase** — all persistence via IndexedDB (`idb`, database `"entelekheia"`)
- **Electron desktop** — packaged as `.dmg` / `.exe` / `.AppImage` via `electron-builder`
- **dot-agent-kernel** — Rust/WASM FSM executor integrated for deterministic chat routing (using `@dot-agent/sdk`)
- **License** — Apache 2.0 (`license` file) + `NOTICE` with dual attribution; source files carry copyright headers

Technical architecture: see [`dot-agent.md`](./dot-agent.md).

---

## Persona

You are the guardian of the `dot-agent` architecture in Murici. Your role is to ensure that the `.agent` and `.flow` behavior specification design is respected at all times.

**Obligation:** Never introduce coupling between the FSM parser/engine and React components or Next.js routes. The Flow Engine is a black box (WASM wrapper).

**Expertise:**
- Safe FSM manipulation.
- WASM (`wasm-bindgen`) integration via server APIs and Electron main/utility processes.
- Prompt Engineering (System Prompt Injection, Tool Calling).
- The deterministic `dot-agent-spec` paradigm (`language.md`).

---

## Absolute Rules

1. **Agent packages are in-memory only:** No `.agent` or `.flow` behavior file is written to any database (Supabase is removed; IndexedDB stores conversations/messages/models/keys only). The behavior lifecycle is 100% in-memory in the browser. If asked to persist behavior packages to IndexedDB, warn the user and ask for permission before doing so.

2. **Runtime isolation:** Never write an AST interpreter or regex parser for `.flow` in TypeScript. Murici uses `@dot-agent/sdk`, `@dot-agent/kernel-dsl`, and `@dot-agent/compiler` (linked from `../dot-agent-spec/packages/*`) to execute all FSM logic. To avoid client-side Next.js/Webpack scheme errors (such as `node:fs` imports), behavior state machine logic is run server-side via API endpoints `/api/agent/kernel/*` or in Electron's main process/utilityProcess via `AgentSession`.

3. **Centralized injection:** All prompt modifications for the behavior — goal, guide, teach, intent routing — must go through `lib/runtime/flow-injector.ts`. Never spread behavior-related prompt rules into individual route files.

4. **Direct Effect Returns (not polling):** The UI and the chat handler drive transitions by invoking `KernelProxy` methods (`load_behavior`, `send_intent`, `tick_prompt`, `send_offtopic`), which synchronously return the array of transition effects (`Effect[]`). React components update their state reactively using these returned effects. Do not use `setInterval` or repeatedly call `get_current_state()` to poll the FSM.

5. **Engine in context:** The engine instance proxy (`flowEngine` of type `KernelProxy`) lives in `ChatbotUIContext` so both `agent-right-panel.tsx` (which loads behaviors and renders the graph) and `use-chat-handler.tsx` (which drives `send_intent` / `tick_prompt` after each LLM turn) can access it without prop-drilling.

6. **No intent tags in text:** Intent signaling must use the `trigger_intent` tool call — never `<intent>` text tags. The model must never output control tokens visible to the user. If you are tempted to use regex to extract intents, stop and use tool calling instead.

7. **Context hygiene:** The injector filters previous `[FLOW_CONTEXT]` blocks before re-injecting the current state's block. Never append behavior context cumulatively; always replace.

8. **Non-streaming for behavior turns:** When a behavior state has valid intents, the API request uses `stream: false` so that `tool_calls` are available in the full JSON response. The streaming path is reserved for turns without active intent routing.

9. **Thinking content isolation:** `<think>...</think>` blocks must be extracted from `message.content` by `extractThinkBlocks()` in `processResponse` / `handleFlowChat`. Never store or display raw `<think>` tags in the message content. Reasoning content goes to `thinkingLog`, not to the message text.

10. **Real-time event dispatch:** Behavior events (`FlowEvent`) must be dispatched via `addFlowEvent` at the moment they occur, not batch-written at end of turn. The `flowEvents` array is the authoritative real-time log; `flowDebugLog` is a legacy end-of-turn snapshot kept for raw inspection only.

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
| **Auto-update** | `electron-updater` in `electron/updater.ts`. Only active in packaged builds (`app.isPackaged`). Channel-aware: the update channel (`alpha`/`beta`/`latest`) is derived from the build's own version — see below. |

## Release channels

Murici ships on three side-by-side channels driven by the git tag: `main`/stable
(`vX.Y.Z`), `beta` (`vX.Y.Z-beta.N`), `alpha` (`vX.Y.Z-alpha.N`). Each gets a
distinct `appId` + `productName` (so they install alongside each other) and its
own icon set, all selected in `.github/workflows/electron-release.yml` from the
tag. `electron/updater.ts` reads `app.getVersion()` to opt a prerelease build
into its channel; stable builds stay on `latest` with `allowPrerelease=false`.

Full procedure (cut / promote / install): [`CONTRIBUTING.md`](CONTRIBUTING.md).
Design record: [`project/plans/019-prerelease-track.md`](project/plans/019-prerelease-track.md).
**Never tag a prerelease off `main`** — prereleases come from `alpha`/`beta`.

---

## Key Components

| Area | File(s) | Role |
|------|---------|------|
| **UI** | `components/agents/agent-right-panel.tsx` | Loads behavior (via text or drag-and-drop of `.agent` / `.flow` files), tracks visited states, renders `StateGraph` (custom SVG layout derived from SCXML), and provides simulation buttons. |
| **Engine** | `lib/kernel-proxy.ts` / `@dot-agent/sdk` | Compiles behavior DSL and manages FSM execution sessions via Rust/WASM. FSM execution runs server-side to avoid frontend build errors. |
| **LLM Bridge** | `lib/runtime/flow-injector.ts` | Builds the `[FLOW_CONTEXT]` block, filters old injections, injects style guides into the last user message, and generates the `trigger_intent` tool definition. |
| **Behavior Chat** | `components/chat/chat-helpers/index.ts` → `handleFlowChat` | Non-streaming first turn with tool definition; parses provider-specific tool calls. Streams the second turn and extracts reasoning tags via `extractThinkBlocks`. |
| **Chat Handler** | `components/chat/chat-hooks/use-chat-handler.tsx` | Branches to `handleFlowChat` when behavior has active intents; coordinates `send_intent()` and `tick_prompt()`, dispatches real-time event logs, and records debugging snapshots. |
| **Thinking Display** | `components/messages/message-thinking-block.tsx` | Collapsible `🧠 Raciocínio` block rendered inside assistant message bubble; reads `thinkingLog[sequence_number]` from context. |
| **Flow Event Cards** | `components/messages/flow-event-card.tsx` | Visual timeline cards representing FSM state transitions and execution events, rendered in `chat-messages.tsx` in timestamp order. |
| **Context** | `context/context.tsx` + `components/utility/global-state.tsx` | Stores `flowEngine`, `flowState`, `flowDebugLog`, `thinkingLog`, `flowEvents` + `addFlowEvent`. |
| **API Routes** | `app/api/chat/openai`, `anthropic`, `custom` | OpenAI and custom routes use manual `for await` streaming to wrap `delta.reasoning_content` in `<think>` tags. Switch to `stream: false` only when tool calls are present. |
| **Types** | `types/flow-event.ts`, `types/flow-debug.ts` | `FlowEvent` (real-time event log) and `FlowTurnDebug` (end-of-turn debug snapshot, including `toolExchange`). |

---

## Troubleshooting Behavior Flow

If the behavior fails to transition state, investigate in this order:

1. **Effects loaded?** Check that `load_behavior()` successfully returns the initial goal and guide effects and sets `flowState` in the context.

2. **`flowState` injected?** Open the debug panel on the assistant message. Check "Sent messages" — the system message should start with `[FLOW_CONTEXT]` containing the current state and goal.

3. **Tool in request?** In the browser Network tab, inspect the request to `/api/chat/{provider}`. It should contain a `tools` array with `trigger_intent`. If not, check that `flowState.validIntents` is non-empty and that `handleFlowChat` branch was taken.

4. **Model called the tool?** Check the Transition Event Cards or debug panel. If the `fsm_transition` event is triggered and its intent is non-null, the tool was called and `send_intent()` was invoked. If null, the model didn't call the tool — adjust the behavior goal description, knowledge, or guide.

5. **StateGraph not updating?** The `StateGraph` updates reactively based on `scxml={graphData}` and `visitedStates` updates in context. Check that `KernelState.graph` (SCXML string) is parsed successfully using `DOMParser` in `components/agents/state-graph.tsx`.

6. **Flow event cards not appearing?** Check `flowEvents` in React DevTools. Events are keyed by `seqNum` — verify the `seqNum` computed in `use-chat-handler.tsx` matches `message.sequence_number` rendered by `Message`.

7. **Thinking block not showing after turn?** `handleFlowChat`'s `showIndicatorAndStream` calls `onThinkingUpdate` during the second-turn stream. Verify that `thinkingLog[seqNum]` is set correctly.

8. **`<think>` tags visible in message?** `extractThinkBlocks` wasn't called on that content path. Check that both the streaming path (`processResponse`) and the non-streaming fallback in `handleFlowChat` apply the extraction.

9. **Electron: WASM not loading in packaged app?** The standalone Next.js server serves unpacked files through its HTTP layer. Ensure `electron-builder.yml` has `asarUnpack` covering `**/*.wasm` and `**/dot-agent-kernel/**`.

---

## Effect Reference (WASM → JS)

Effects are returned in the response array from `load_behavior()`, `send_intent()`, `send_offtopic()`, or `tick_prompt()`:

| `effect.type` | Fields | What to do |
|---------------|--------|-----------|
| `goal` | `text` | Injected into the system prompt `[FLOW_CONTEXT]` block |
| `guide` | `text` | Prepended to the last user message to guide style/response style |
| `teach` | `text` | Injected as a knowledge block inside system prompt |
| `request_interact` | *(no fields)* | Marks behavior engine as waiting for user input |
| `transition` | `from`, `to` | Highlights transition from `from` to `to` states; updates visited states |
| `run_script` | `target`, `label`, `silent` | Executes script; calls `engine.send_event("script.done")` when done |
| `run_tool` | `target`, `label` | Invokes tool; passes result to LLM; calls `engine.send_event("tool.done")` |
| `parse_error` | `message` | Logs compilation/syntax error; halts FSM execution |

