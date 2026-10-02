---
description: "Murici invariants: the worker-hosted FSM, per-thread sessions, the single injector, Edge streaming with reasoning kept apart, agent persistence, and the Electron WASM and storage traps."
trigger: always_on
---

## Repo guardrails — break these and something breaks

1. FSM logic **MUST** run in the shared renderer Web Worker ([`worker/fsm.worker.ts`](../../worker/fsm.worker.ts),
   created by [`lib/kernel-proxy.ts`](../../lib/kernel-proxy.ts)) through `@dot-agent/sdk`. A `.agent` or
   `.flow` parser or interpreter in TypeScript, or a kernel call from a React component or a route,
   **MUST NOT** be written.
2. Worker calls **MUST** stay serialized by the `messageQueue` promise chain, and `set_memory` writes
   **MUST** go to the queue flushed after the outer call: calling `injectMemory` re-entrantly panics
   wasm-bindgen ("recursive use of an object").
3. UI state **MUST** be driven from the effects each `KernelProxy` call returns, rather than by polling
   `get_current_state()`.
4. A request and its `trigger_intent` **MUST** read the channel's own session through
   `deps.getAgentSession`, rather than the global `flowState`/persona. The legacy context mirror **MUST**
   be written only for the viewed thread.
5. Model-facing behaviour text **MUST** go through `lib/runtime/dot-agent-injector.ts`. Per-turn state is a
   simulated `get_current_state` tool call and result before the last user message, injected only when the
   last message is the user's, recomputed every request, and **MUST NOT** be persisted.
6. Intent **MUST** be signalled by the `trigger_intent` tool call, rather than by `<intent>` tags or a regex
   over model output.
7. `addToolOutput` **MUST NOT** be awaited in the channel controller — it deadlocks. `MAX_AUTO_STEPS` and the
   one-resubmit-per-assistant-message guard **MUST** stay.
8. Chat routes **MUST** run on the Edge runtime and stream through `streamAgentResponse`
   ([`lib/server/agent-stream.ts`](../../lib/server/agent-stream.ts), `streamText`), with `onError` kept on
   the UI stream so the real error reaches the client (ADR-0006).
9. Reasoning **MUST** reach the client as reasoning parts stored in `thinkingLog`, rather than as message
   text: the custom route folds `reasoning_content` into `<think>` (`withReasoningContentAsThink`) and
   `extractReasoningMiddleware` splits it out. That route **MUST** stay on `custom.chat()` — the Responses
   API drops `reasoning_content`.
10. An agent bundle **MUST** be persisted in `agentBundles` (keyed by `conversationId`) and `recentAgents`
    so a chat can recover it; kernel state **MUST NOT** be persisted — a reload revives the agent at its
    initial state.
11. Edits to the effect types **MUST** go to `types/kernel-effect.ts`. Its `.d.ts` and `.js` siblings are
    tsc output of `npm run electron:compile`, which strips the SPDX line; a regenerated `.d.ts` that lost
    its header **MUST NOT** be committed.
12. A change under [`agents/`](../../agents/) **MUST** be followed by `npm run build:agents`, committing the
    repacked `public/agents/*.agent` with it — nothing else repacks them.
13. Every source file **MUST** carry its license header, as [`CONTRIBUTING.md`](../../CONTRIBUTING.md#committing-code)
    states; an existing header **MUST NOT** be removed or altered.
14. `asarUnpack` in [`electron-builder.yml`](../../electron-builder.yml) **MUST** keep `**/*.wasm` and
    `**/dot-agent-kernel/**`; a packaged app that cannot load the kernel lost these entries.
15. Desktop data **MUST** be verified in the Electron window's DevTools, rather than in a browser tab on
    `localhost:3000`: Electron's IndexedDB lives in its per-app partition, so the tab reads a different,
    usually empty, copy.
