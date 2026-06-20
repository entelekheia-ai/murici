# Behavior (dot-agent) Integration in Murici

This document records the architectural decisions and implementations in Murici to support the `dot-agent-spec` (`.agent` and `.flow` behavior files).

## Deployment Targets

The repo ships in three progressively layered forms — same codebase, different surfaces:

| Phase | Command | Who uses it |
|-------|---------|-------------|
| **Web / dev** | `npm run dev` | Devs testing behaviors locally |
| **Electron desktop** | `npm run electron:dev` / `npm run electron:build` | Any user — installs `.dmg`/`.exe`/`.AppImage`, no terminal needed |
| **Electron production** | `next build` (standalone) → `electron-builder` | Distributed via GitHub Releases |

### Persistence — IndexedDB

All data (conversations, messages, custom models, settings, API keys) is stored in browser-native **IndexedDB** via the `idb` library, in a database named `"entelekheia"`. There is no Supabase, no external auth, no external database.

- `lib/local-db/` — schema + CRUD helpers (`conversations`, `messages`, `customModels`, `settings`)
- `db/` — shim layer that re-exports from `lib/local-db/`; existing import paths unchanged
- IndexedDB works identically in Chromium (web) and in Electron's renderer process.

### WASM in Electron (production concern)

The `@dot-agent/sdk` packages load their `.wasm` binary via `fetch(new URL('...bg.wasm', import.meta.url))`. Inside an Electron ASAR archive this fetch fails. `electron-builder.yml` therefore sets:

```yaml
asarUnpack:
  - "**/*.wasm"
  - "**/dot-agent-kernel/**"
```

In production, the Next.js app runs as a standalone child process spawned by the Electron main process (`electron/next-server.ts`). The WASM fetch goes through the embedded HTTP server, which serves unpacked files normally.

## Scope

The current goal is to validate deterministic FSM-based chat routing. Everything runs browser-native — no Supabase, no external database. Behavior packages (`.agent` metadata and `.flow` DSL text) remain in-memory; conversations, messages, custom models, and API keys are persisted to IndexedDB.

## Architecture

### 1. UI — Agent Right Panel (Behavior Sidebar)

A right sidebar (`components/agents/agent-right-panel.tsx`) manages the active behavior:

- **Drag-and-Drop Support**: Users can drag and drop `.agent` bundles (containing metadata and behaviors) or plain `.flow` DSL files directly into the panel to load them.
- **Top area**: Displays metadata about the compiled agent (`aboutme` card, name, version) or an edit tab to view/paste `.flow` DSL text.
- **Graph area**: A live state graph dynamically parsed from the SCXML representation (`session.getGraph()`). The graph is drawn using custom SVG layouts and transitions in React (`components/agents/state-graph.tsx`). The current state is highlighted in warm tones; visited states are shown in gray.
- **State bar**: Shows the current state name and one simulate-button per valid intent.

### 2. Runtime — AgentSession SDK (`@dot-agent/sdk`)

The FSM behavior is compiled and executed by `@dot-agent/sdk` and `@dot-agent/kernel-dsl` monorepo packages, rather than running client-side in TypeScript:

- **Packages**:
  - `@dot-agent/sdk`: `"file:../dot-agent-spec/packages/sdk"`
  - `@dot-agent/kernel-dsl`: `"file:../dot-agent-spec/packages/kernel-dsl"`
  - `@dot-agent/compiler`: `"file:../dot-agent-spec/packages/compiler"`
- **Server-Side API Routing**: To avoid frontend Webpack compilation issues with Node.js built-ins (`node:fs`, `node:url` scheme errors), the WASM/DSL kernel executes on the server side. The frontend sends fetch requests to the API endpoints (`/api/agent/kernel/*`). In Electron desktop mode, calls are routed to the main Node.js process.
- **Synchronous Effects Return**: The engine proxy (`KernelProxy`) returns execution effects (`Effect[]`) directly in response to method calls (e.g. `load_behavior`, `send_intent`, `tick_prompt`, `send_offtopic`), replacing the asynchronous observer pattern.
- **Reactive state**: When the client component or chat handler receives returned effects, they parse directives (`goal`, `guide`, `teach`) and update `flowState` in the context (`ChatbotUIContext`). Visited states and SCXML graphs are tracked in tandem.
- **Shared engine**: The `KernelProxy` instance is stored in context (`flowEngine`) so that `use-chat-handler.tsx` can invoke state transitions without prop-drilling.

### 3. Effect Types & Handling

The kernel emits distinct effect types, handled synchronously:

| Category | Effect | Who handles it | Implementation |
|----------|--------|---|---|
| **LLM directives** | `goal`, `guide`, `teach` | LLM runtime | Injected into system/user messages by `flow-injector.ts` |
| **Interaction** | `request_interact` | Flow UI | Context marks FSM as "waiting for user input" |
| **Execution** | `run_script`, `run_subagent`, `run_tool` | Future: script runtime | Currently logged to console |
| **State change** | `transition` | Flow UI + debugger | Updates current state, visited states, SCXML graph |
| **Memory** | `set_memory` | Memory store | Kernel-internal; logged for debugging |
| **UI effects** | `apply_css`, `remove_css`, `apply_html`, `remove_html`, `apply_video`, `remove_video` | UI layer | Future: DOM manipulation; currently logged to console |
| **Error** | `parse_error` | Debugger | Logged to console; render error in FSM state |

### 4. LLM Bridge — Behavior Injector

`lib/runtime/flow-injector.ts` modifies the messages array before it reaches the model:

- **Context hygiene**: Previous `[FLOW_CONTEXT]` blocks are filtered out on every turn, ensuring the history never accumulates stale instructions from past states.
- **`goal` + `teach`** → injected at the top of the system message inside a `[FLOW_CONTEXT]...[/FLOW_CONTEXT]` block.
- **`guide`** → prepended directly into the content of the last user message as a style directive (`[Style: guide_text]`).
- **No `<intent>` tags**: When the state has valid intents, `buildTriggerIntentTool()` returns a tool definition (`trigger_intent`) that is passed to the API. The model signals transitions via a structured function call, never via text tags.

`build-prompt.ts` calls `injectFlowContext` and passes an optional `onFinalMessages` callback so callers can capture the final messages array for debugging.

### 5. Tool Calling — Structured Intent Signaling

When a behavior state has valid intents, each LLM request includes the `trigger_intent` tool:

```json
{
  "type": "function",
  "function": {
    "name": "trigger_intent",
    "description": "Signals a state transition in the deterministic flow engine when the current state's goal is achieved or the message is off-topic...",
    "parameters": {
      "type": "object",
      "properties": {
        "intent_name": { "type": "string", "enum": ["continue", "skip"] }
      }
    }
  }
}
```

### 6. Post-Turn Routing Loop

After each LLM response, `use-chat-handler.tsx`:

1. If the behavior has valid intents (and provider is not Ollama): uses `handleFlowChat` (non-streaming + tool calling).
2. Extracts `intentName` from the tool call result.
3. Calls `flowEngine.send_intent(intentName)` → FSM transitions and returned effects update the context `flowState`.
4. Always calls `flowEngine.tick_prompt()` to advance the prompt counter (enables `after N prompts` handlers in the DSL).
5. Records a `FlowTurnDebug` entry in `flowDebugLog` context (keyed by assistant message `sequence_number`).

### 7. Thinking / Reasoning Display

When a model returns reasoning content (either inline `<think>...</think>` tags or `delta.reasoning_content` from OpenAI-compatible APIs), the UI extracts it from the stream in real time:

- **Extraction**: `processResponse`, `handleLocalChat`, `handleHostedChat`, and `handleFlowChat` all call `extractThinkBlocks(rawAccum)` on each chunk. Thinking content is separated from display text; `message.content` never contains `<think>` tags.
- **API routes**: `app/api/chat/custom` and `app/api/chat/openai` use a manual `for await` loop instead of `OpenAIStream`. `delta.reasoning_content` is wrapped in `<think>...</think>` before being emitted, so the client parser works uniformly.
- **Storage**: `thinkingLog: Record<number, string>` in `ChatbotUIContext`, keyed by `message.sequence_number`.
- **Rendering**: `MessageThinkingBlock` renders a collapsible `🧠 Raciocínio — N palavras` block **inside** the assistant message bubble, above `MessageMarkdown`.

### 8. Real-Time Flow Event Log

Instead of a single consolidated debug bubble, each turn produces individual `FlowEvent` cards that appear in the chat in temporal order — before the assistant message — as each event fires:

| Type | Actor | Fires when |
|------|-------|-----------|
| `flow_context` | 🔷 Flow | `preTransitionFlowState` captured at turn start |
| `llm_request` | ⚙ chatbot-ui→LLM | `onFinalMessages` callback fires (messages built) |
| `tool_call` | 🔧 LLM | `trigger_intent` detected in first-turn response |
| `second_turn` | ⚙ chatbot-ui→LLM | Before second fetch in `showIndicatorAndStream` |
| `fsm_transition` | → Flow | After `flowEngine.send_intent()` returns a `transition` effect |

- **Type**: `FlowEvent` in `types/flow-event.ts`.
- **Storage**: `flowEvents: FlowEvent[]` (append-only) + `addFlowEvent` in `ChatbotUIContext`.
- **Rendering**: `chat-messages.tsx` filters events by `seqNum`, sorts by `timestamp`, renders `FlowEventCard` components before each assistant `Message`.
- **Legacy debug**: `FlowSystemDebugBubble` still rendered as a collapsed `<details>` after the message for raw JSON inspection.

## Data Flow

```
AgentRightPanel (drag-drop / tab-edit)
  └─ KernelProxy load_behavior() → sets flowState in ChatbotUIContext
                                 → tracks visitedStates, updates StateGraph (SCXML)

useChatHandler (per turn, behavior active)
  ├─ addFlowEvent({ type:"flow_context", seqNum, ... })
  ├─ handleFlowChat → buildFinalMessages → injectFlowContext
  │                 → POST /api/chat/{provider} with tools (non-streaming)
  │                 → parse content + tool_calls
  │                 → onEvent("tool_call") when trigger_intent detected
  │                 → onEvent("second_turn") before second fetch
  │                 → extractThinkBlocks(rawAccum) during streaming
  ├─ flowEngine.send_intent(intentName) → updates context with returned effects
  │   └─ addFlowEvent({ type:"fsm_transition", ... })
  ├─ flowEngine.tick_prompt()
  └─ setFlowDebugLog[seqNum] = FlowTurnDebug
```

## License & Compliance

The project is licensed under **Apache License 2.0**. The original upstream (`mckaywrigley/chatbot-ui`) is MIT; both licenses are preserved via a dual-attribution model documented in the `NOTICE` file.

---

## Formal Architecture Principles

- **Syntactic isolation**: No control token or logic tag generated by the LLM (e.g. `<intent>`) may leak to the user-visible chat layer. Reasoning content (`<think>` tags) is extracted from `message.content` before display and storage.
- **Structured transition channel**: Intent signaling uses first-class function calls (`trigger_intent`) via tool calling — never text parsing.
- **Context hygiene**: Every request filters previous `[FLOW_CONTEXT]` injections so the message history never accumulates stale state instructions.
- **Runtime isolation**: All FSM logic lives in the WASM kernel session. No `.flow` parsing or state management in TypeScript.
- **Real-time observability**: Flow events are dispatched as they fire (not batch-written at end of turn), so the chat UI updates temporally — each actor's action appears at the moment it happens.

---

Agent coding guidelines (rules, constraints, troubleshooting): see [AGENTS.md](./AGENTS.md).
