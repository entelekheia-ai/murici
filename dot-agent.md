# dot-agent Integration in chatbot-ui

This document records the architectural decisions and implementations in `chatbot-ui` to support the `dot-agent-spec` (`.agent` and `.flow` files).

## Deployment Targets

The repo ships in three progressively layered forms — same codebase, different surfaces:

| Phase | Command | Who uses it |
|-------|---------|-------------|
| **Web / dev** | `npm run dev` | Devs testing flows locally |
| **Electron desktop** | `npm run electron:dev` / `npm run electron:build` | Any user — installs `.dmg`/`.exe`/`.AppImage`, no terminal needed |
| **Electron production** | `next build` (standalone) → `electron-builder` | Distributed via GitHub Releases |

### Persistence — IndexedDB (Phase 1+)

All data (conversations, messages, custom models, settings, API keys) is stored in browser-native **IndexedDB** via the `idb` library, in a database named `"entelekheia"`. There is no Supabase, no external auth, no external database.

- `lib/local-db/` — schema + CRUD helpers (`conversations`, `messages`, `customModels`, `settings`)
- `db/` — shim layer that re-exports from `lib/local-db/`; existing import paths unchanged
- IndexedDB works identically in Chromium (web) and in Electron's renderer process (same engine)

### WASM in Electron (production concern)

`dot-agent-kernel` loads its `.wasm` binary via `fetch(new URL('...bg.wasm', import.meta.url))`. Inside an Electron ASAR archive this fetch fails. `electron-builder.yml` therefore sets:

```yaml
asarUnpack:
  - "**/*.wasm"
  - "**/dot-agent-kernel/**"
```

In production the Next.js app runs as a standalone child process spawned by the Electron main process (`electron/next-server.ts`). The WASM fetch goes through the embedded HTTP server, which serves unpacked files normally.

## Scope

The current goal is to validate deterministic FSM-based chat routing. Everything runs browser-native — no Supabase, no external database. Agent packages (`.flow` DSL text) remain in-memory; conversations, messages, custom models, and API keys are persisted to IndexedDB.

## Architecture

### 1. UI — Agent Right Panel

A right sidebar (`components/agents/agent-right-panel.tsx`) manages the active flow:

- **Top area:** Textarea to paste or edit `.flow` DSL text, with a "Load / Reload Flow" button.
- **Graph area:** A live Mermaid diagram derived dynamically from `engine.get_graph()`. The current state is highlighted in purple; states already visited are shown in gray.
- **State bar:** Shows the current state name and one simulate-button per valid intent.

### 2. Runtime — dot-agent-kernel (WASM)

The FSM is executed by a compiled Rust/WASM module (`dot-agent-kernel`), not in TypeScript:

- **Package:** `"dot-agent-kernel": "file:../dot-agent-spec/dsl/dot-agent-kernel/pkg"`
- **Observer pattern:** The engine exposes `observe(callback)` — the equivalent of a WebAssembly `importObject`. The callback fires once per `Effect` object whenever the FSM produces output (`goal`, `guide`, `teach`, `transition`, `request_interact`, etc.).
- **Reactive state:** `agent-right-panel.tsx` registers the observer immediately after creating the engine. The observer accumulates `goal`/`guide`/`teach` directives and on `request_interact` pushes the full `flowState` to React context (`ChatbotUIContext`). On `transition` it records the visited state and updates the Mermaid diagram.
- **Shared engine:** The engine instance is stored in context (`flowEngine`) so that `use-chat-handler.tsx` can call `send_intent()` and `tick_prompt()` after each LLM response without prop-drilling.

### 3. LLM Bridge — Flow Injector

`lib/runtime/flow-injector.ts` modifies the messages array before it reaches the model:

- **Context hygiene:** Previous `[FLOW_CONTEXT]` blocks are filtered out on every turn, ensuring the history never accumulates stale instructions from past states.
- **`goal` + `teach`** → injected at the top of the system message inside a `[FLOW_CONTEXT]...[/FLOW_CONTEXT]` block.
- **`guide`** → prepended directly into the content of the last user message (no extra role, avoids breaking turn alternation).
- **No `<intent>` tags:** When the state has valid intents, `buildTriggerIntentTool()` returns a tool definition (`trigger_intent`) that is passed to the API. The model signals transitions via a structured function call, never via text tags.

`build-prompt.ts` calls `injectFlowContext` and passes an optional `onFinalMessages` callback so callers can capture the final messages array for debugging.

### 4. Tool Calling — Structured Intent Signaling

When a flow state has valid intents, each LLM request includes the `trigger_intent` tool:

```json
{
  "type": "function",
  "function": {
    "name": "trigger_intent",
    "description": "Signals a state transition when the current state's goal is achieved.",
    "parameters": {
      "type": "object",
      "properties": {
        "intent_name": { "type": "string", "enum": ["continue", "skip"] }
      },
      "required": ["intent_name"]
    }
  }
}
```

The API routes (`/api/chat/openai`, `/api/chat/anthropic`, `/api/chat/custom`) detect the `tools` field in the request body and switch to **non-streaming** mode (`stream: false`), returning the full JSON response. Anthropic uses `input_schema` format and `content[].type === "tool_use"` for the response.

`handleFlowChat` (in `components/chat/chat-helpers/index.ts`) handles this non-streaming path: it builds the messages, calls the appropriate route with `tools`, parses the response to extract both the text content and the `trigger_intent` call, and updates the chat UI directly.

### 5. Post-Turn Routing Loop

After each LLM response, `use-chat-handler.tsx`:

1. If the flow has valid intents (and provider is not Ollama): uses `handleFlowChat` (non-streaming + tool calling).
2. Extracts `intentName` from the tool call result (no regex).
3. Calls `flowEngine.send_intent(intentName)` → FSM transitions and the observer fires the new state's directives into `flowState`.
4. Always calls `flowEngine.tick_prompt()` to advance the prompt counter (enables `after N prompts` handlers in the DSL).
5. Records a `FlowTurnDebug` entry in `flowDebugLog` context (keyed by assistant message `sequence_number`).

### 6. Thinking / Reasoning Display

When a model returns reasoning content (either inline `<think>...</think>` tags or `delta.reasoning_content` from OpenAI-compatible APIs), the UI extracts it from the stream in real time:

- **Extraction:** `processResponse`, `handleLocalChat`, `handleHostedChat`, and `handleFlowChat` all call `extractThinkBlocks(rawAccum)` on each chunk. Thinking content is separated from display text; `message.content` never contains `<think>` tags.
- **API routes:** `app/api/chat/custom` and `app/api/chat/openai` use a manual `for await` loop instead of `OpenAIStream`. `delta.reasoning_content` (Qwen3, DeepSeek R1 style) is wrapped in `<think>...</think>` before being emitted, so the client parser works uniformly.
- **Storage:** `thinkingLog: Record<number, string>` in `ChatbotUIContext`, keyed by `message.sequence_number`.
- **Rendering:** `MessageThinkingBlock` renders a collapsible `🧠 Raciocínio — N palavras` block **inside** the assistant message bubble, above `MessageMarkdown`.

### 7. Real-Time Flow Event Log

Instead of a single consolidated debug bubble, each turn produces individual `FlowEvent` cards that appear in the chat in temporal order — before the assistant message — as each event fires:

| Type | Actor | Fires when |
|------|-------|-----------|
| `flow_context` | 🔷 Flow | `preTransitionFlowState` captured at turn start |
| `llm_request` | ⚙ chatbot-ui→LLM | `onFinalMessages` callback fires (messages built) |
| `tool_call` | 🔧 LLM | `trigger_intent` detected in first-turn response |
| `second_turn` | ⚙ chatbot-ui→LLM | Before second fetch in `showIndicatorAndStream` |
| `fsm_transition` | → Flow | After `flowEngine.send_intent()` returns a `transition` effect |

- **Type:** `FlowEvent` in `types/flow-event.ts` — fields: `id`, `seqNum`, `type`, `timestamp`, `data`.
- **Storage:** `flowEvents: FlowEvent[]` (flat array, append-only) + `addFlowEvent` in `ChatbotUIContext`.
- **Rendering:** `chat-messages.tsx` filters events by `seqNum`, sorts by `timestamp`, renders `FlowEventCard` components before each assistant `Message`.
- **Legacy debug:** `FlowSystemDebugBubble` still rendered as a collapsed `<details>` after the message for raw JSON inspection.

## Data Flow

```
AgentRightPanel
  └─ observe() callback → sets flowState in ChatbotUIContext
                        → tracks visitedStates, updates StateGraph

useChatHandler (per turn, flow active)
  ├─ addFlowEvent({ type:"flow_context", seqNum, ... })
  ├─ handleFlowChat → buildFinalMessages → injectFlowContext
  │                 → POST /api/chat/{provider} with tools (non-streaming)
  │                 → parse content + tool_calls
  │                 → onEvent("tool_call") when trigger_intent detected
  │                 → onEvent("second_turn") before second fetch
  │                 → extractThinkBlocks(rawAccum) during streaming
  ├─ flowEngine.send_intent(intentName) → observer fires → flowState updates
  │   └─ addFlowEvent({ type:"fsm_transition", ... })
  ├─ flowEngine.tick_prompt()
  └─ setFlowDebugLog[seqNum] = FlowTurnDebug  (legacy full snapshot)

chat-messages.tsx
  ├─ flowEvents.filter(e => e.seqNum === N) → [FlowEventCard, ...]
  ├─ <Message> (includes MessageThinkingBlock if thinkingLog[N] exists)
  └─ flowDebugLog[N] → <details> "ver debug completo" (collapsed)
```

## License & Compliance

The project is licensed under **Apache License 2.0**. The original upstream (`mckaywrigley/chatbot-ui`) is MIT; both licenses are preserved via a dual-attribution model documented in the `NOTICE` file.

### Header convention

Every `.ts`, `.tsx`, `.js`, `.jsx` source file must carry one of three headers at the very top:

| Category | When | Header |
|----------|------|--------|
| **New file** (absent from `upstream/main`) | Created for this fork | Full Apache 2.0 boilerplate — sole copyright: Danilo Borges 2026 |
| **Modified legacy** (present in `upstream/main`, changed) | Upstream file that was refactored | Mixed attribution — Apache 2.0 + "Portions Copyright McKay Wrigley (MIT)" |
| **Unmodified legacy** (present in `upstream/main`, untouched) | Upstream file kept as-is | MIT attribution only — "Portions Copyright McKay Wrigley" |

### Automation

Two scripts live in `scripts/`:

| Script | Purpose |
|--------|---------|
| `scripts/add-license-headers.sh` | **One-shot full-repo scan.** Categorises all tracked files via `git diff upstream/main HEAD` and bulk-injects the appropriate headers. Safe to re-run (skips files that already have `Copyright`). |
| `scripts/ensure-license-headers.sh` | **Pre-commit hook.** Processes only staged files. Picks the header based on whether the file exists in `upstream/main`. Re-stages modified files so the header lands in the same commit. |

The pre-commit hook is registered in `.husky/pre-commit` and runs after `lint:fix` and `format:write`.

### Root compliance files

| File | Contents |
|------|---------|
| `license` | Full Apache License 2.0 text |
| `NOTICE` | Attribution block: `.agent UI Runtime` + original Chatbot UI credit |

---

## Formal Architecture Principles

- **Syntactic isolation:** No control token or logic tag generated by the LLM (e.g. `<intent>`) may leak to the user-visible chat layer. Reasoning content (`<think>` tags) is extracted from `message.content` before display and storage.
- **Structured transition channel:** Intent signaling uses first-class function calls (`trigger_intent`) via tool calling — never text parsing.
- **Context hygiene:** Every request filters previous `[FLOW_CONTEXT]` injections so the message history never accumulates stale state instructions.
- **Runtime isolation:** All FSM logic lives in the WASM kernel. No `.flow` parsing or state management in TypeScript.
- **Real-time observability:** Flow events are dispatched as they fire (not batch-written at end of turn), so the chat UI updates temporally — each actor's action appears at the moment it happens.
