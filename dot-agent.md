# dot-agent Integration in chatbot-ui

This document records the architectural decisions and implementations in `chatbot-ui` to support the `dot-agent-spec` (`.agent` and `.flow` files).

## Scope (In-Memory MVP)

The current goal is to validate deterministic FSM-based chat routing without persisting agent packages to a database (Supabase). Everything runs client-side / in-memory.

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

### 6. Per-Message Debug Panel

Every assistant message has a collapsible debug section (visible only when a flow is active and debug data exists for that turn). It shows:

- Active FSM state at the time the user sent the message
- `goal` / `guide` / `teach` directives that were active
- Valid intents offered to the model
- Full messages array sent to the API (with flow injections included)
- Model response text
- Intent triggered via tool call (if any)
- Effects produced by `send_intent` / `tick_prompt`

## Data Flow

```
AgentRightPanel
  └─ observe() callback → sets flowState in ChatbotUIContext
                        → tracks visitedStates, updates Mermaid diagram

useChatHandler (per turn, flow active)
  ├─ handleFlowChat → buildFinalMessages → injectFlowContext
  │                 → POST /api/chat/{provider} with tools (non-streaming)
  │                 → parse content + tool_calls
  ├─ flowEngine.send_intent(intentName) → observer fires → flowState updates
  ├─ flowEngine.tick_prompt()
  └─ setFlowDebugLog[seqNum] = FlowTurnDebug

message.tsx
  └─ flowDebugLog[message.sequence_number] → <details> debug panel
```

## Formal Architecture Principles

- **Syntactic isolation:** No control token or logic tag generated by the LLM (e.g. `<intent>`) may leak to the user-visible chat layer.
- **Structured transition channel:** Intent signaling uses first-class function calls (`trigger_intent`) via tool calling — never text parsing.
- **Context hygiene:** Every request filters previous `[FLOW_CONTEXT]` injections so the message history never accumulates stale state instructions.
- **Runtime isolation:** All FSM logic lives in the WASM kernel. No `.flow` parsing or state management in TypeScript.
