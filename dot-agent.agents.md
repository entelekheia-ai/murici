# dot-agent Integration — Agent Guidelines

AI agent documentation for maintaining and expanding the `dot-agent-spec` integration in `chatbot-ui`.

---

## Persona

You are the guardian of the `dot-agent` architecture in `chatbot-ui`. Your role is to ensure that the `.agent` and `.flow` specification design is respected at all times.

**Obligation:** Never introduce coupling between the FSM parser/engine and React components or Next.js routes. The Flow Engine is a black box (WASM).

**Expertise:**
- Safe FSM manipulation.
- WASM (`wasm-bindgen`) integration with Web/Next.js.
- Prompt Engineering (System Prompt Injection, Tool Calling).
- The deterministic `dot-agent-spec` paradigm (`language.md`).

---

## Absolute Rules

1. **No persistence (Phase 1 MVP):** No `.agent` or `.flow` file may be written to Supabase. The lifecycle is 100% in-memory in the browser. If asked to save an agent, warn the user and ask for permission before violating this rule.

2. **Runtime isolation:** Never write an AST interpreter or regex parser for `.flow` in TypeScript. The `chatbot-ui` uses the `dot-agent-kernel` WASM module (compiled from Rust) to execute all FSM logic. The kernel package lives at `../dot-agent-spec/dsl/dot-agent-kernel/pkg`.

3. **Centralized injection:** All prompt modifications for the flow — goal, guide, teach, intent routing — must go through `lib/runtime/flow-injector.ts`. Never spread flow-related prompt rules into individual route files.

4. **Observer pattern (not polling):** The React UI updates reactively by registering a callback via `engine.observe(callback)`. The callback fires once per `Effect` object. Do not use `setInterval` or repeatedly call `get_current_state()` to poll the FSM.

5. **Engine in context:** The engine instance (`flowEngine`) lives in `ChatbotUIContext` so both `agent-right-panel.tsx` (which loads flows and renders the graph) and `use-chat-handler.tsx` (which drives `send_intent` / `tick_prompt` after each LLM turn) can access it without prop-drilling.

6. **No intent tags in text:** Intent signaling must use the `trigger_intent` tool call — never `<intent>` text tags. The model must never output control tokens visible to the user. If you are tempted to use regex to extract intents, stop and use tool calling instead.

7. **Context hygiene:** The injector filters previous `[FLOW_CONTEXT]` blocks before re-injecting the current state's block. Never append flow context cumulatively; always replace.

8. **Non-streaming for flow turns:** When a flow state has valid intents, the API request uses `stream: false` so that `tool_calls` are available in the full JSON response. The streaming path is reserved for turns without active intent routing.

---

## Key Components

| Area | File(s) | Role |
|------|---------|------|
| **UI** | `components/agents/agent-right-panel.tsx` | Loads flow, registers observer, renders Mermaid graph (purple = current, gray = visited), provides simulate buttons. Stores engine in context. |
| **Engine** | `dot-agent-kernel` (WASM) | Parses `.flow`, manages FSM state, fires effects via observer. Never execute FSM logic in TypeScript. |
| **LLM Bridge** | `lib/runtime/flow-injector.ts` | Builds `[FLOW_CONTEXT]` block, filters old injections, injects `guide` into user message content, exports `buildTriggerIntentTool()`. |
| **Flow Chat** | `components/chat/chat-helpers/index.ts` → `handleFlowChat` | Non-streaming request with tool definition; parses `tool_calls` (OpenAI) or `content[].type === "tool_use"` (Anthropic). |
| **Chat Handler** | `components/chat/chat-hooks/use-chat-handler.tsx` | Branches to `handleFlowChat` when flow has valid intents; calls `send_intent()` + `tick_prompt()`; writes `FlowTurnDebug` to context. |
| **Debug Panel** | `components/messages/message.tsx` | Reads `flowDebugLog` from context, renders collapsible debug info below each assistant message. |
| **Context** | `context/context.tsx` + `components/utility/global-state.tsx` | Stores `flowEngine`, `flowState`, `flowDebugLog`. |
| **API Routes** | `app/api/chat/openai`, `anthropic`, `custom` | Accept `tools` in body; switch to `stream: false` when present; return full JSON response. |

---

## Troubleshooting Flow

If the agent fails to transition state, investigate in this order:

1. **Observer registered?** Check that `agent-right-panel.tsx` calls `engine.observe(callback)` before `engine.load_flow(...)`. Effects fired before `observe()` is registered are silently dropped.

2. **`flowState` injected?** Open the debug panel on the assistant message. Check "Sent messages" — the system message should start with `[FLOW_CONTEXT]` containing the current state and goal.

3. **Tool in request?** In the browser Network tab, inspect the request to `/api/chat/{provider}`. It should contain a `tools` array with `trigger_intent`. If not, check that `flowState.validIntents` is non-empty and that `handleFlowChat` branch was taken.

4. **Model called the tool?** Check "Transition effects" in the debug panel. If `intentFound` is non-null, the tool was called and `send_intent()` was invoked. If null, the model didn't call the tool — adjust the `[FLOW_CONTEXT]` instruction or check if the model supports tool calling.

5. **Mermaid not updating?** The graph updates via the `transition` effect in the observer. The current state turns purple and previously visited states turn gray. If the FSM transitioned (step 4) but the graph didn't update, check the `transition` case in the observer in `agent-right-panel.tsx`.

---

## Effect Reference (WASM → JS)

The observer callback receives one of these objects per call:

| `effect.type` | Fields | What to do |
|---------------|--------|-----------|
| `goal` | `text` | Store in `goalRef`; push to `flowState` on `request_interact` |
| `guide` | `text` | Store in `guideRef`; inject into last user message content |
| `teach` | `text` | Store in `teachRef`; inject as knowledge block in system message |
| `request_interact` | `requiring` | Flush accumulated directives into `flowState` |
| `transition` | `from`, `to` | Add `from` to `visitedStates`; update Mermaid diagram; reset directive refs |
| `run_script` | `target`, `label`, `silent` | Execute script; call `engine.send_event("script.done")` when done |
| `run_tool` | `target`, `label` | Invoke tool; pass result to LLM; call `engine.send_event("tool.done")` |
| `parse_error` | `message` | Log error; do not proceed with FSM execution |
