# Murici — Agent Guidelines

Murici is a Next.js + Electron chat app that runs `.agent` behaviours: a deterministic state machine,
executed by the `@dot-agent/sdk` WASM kernel, decides where a conversation goes, and the model only signals
intent. It is a fork of [`mckaywrigley/chatbot-ui`](https://github.com/mckaywrigley/chatbot-ui) (MIT),
relicensed Apache-2.0 with dual attribution — see [`NOTICE`](NOTICE).

The `@dot-agent/*` packages are pinned to exact versions from npm (`package.json`). Their
language reference is the [dot-agent platform](https://github.com/dot-agent-spec/platform), not this repo.

## Source of truth

| What | Where |
|---|---|
| Architecture decisions (sessions, turn loop, channels, streaming errors) | [`project/adr/`](project/adr/) — 0007 (per-thread channels) is the current shape |
| Persona, rules and per-turn FSM text sent to the model | [`lib/runtime/dot-agent-injector.ts`](lib/runtime/dot-agent-injector.ts) |
| The `trigger_intent` tool actually sent | [`lib/tools/registry.ts`](lib/tools/registry.ts) (`buildTriggerIntentTool` in the injector only feeds the sidebar) |
| The turn loop: tool call → `send_intent` → effects | [`lib/channels/channel-controller.ts`](lib/channels/channel-controller.ts) (`onToolCall`) |
| Per-thread status, flow events, active CSS | [`lib/store/channel-store.ts`](lib/store/channel-store.ts) |
| IndexedDB schema (`"entelekheia"`) | [`lib/local-db/schema.ts`](lib/local-db/schema.ts) |
| Effect types | [`types/kernel-effect.ts`](types/kernel-effect.ts), hand-mirrored from the kernel's `src/effect.rs` |
| Release, branches, license headers, running from source | [`CONTRIBUTING.md`](CONTRIBUTING.md) |

## Invariants — break these and something breaks

1. **The FSM runs in the renderer, in one shared Web Worker** ([`worker/fsm.worker.ts`](worker/fsm.worker.ts),
   created by [`lib/kernel-proxy.ts`](lib/kernel-proxy.ts)). Never write a `.agent`/`.flow` parser or
   interpreter in TypeScript, and never couple the kernel to React components or routes.
2. **Worker calls are serialized** by the `messageQueue` promise chain. `set_memory` writes are queued and
   flushed after the outer call: calling `injectMemory` re-entrantly panics wasm-bindgen ("recursive use of
   an object"). Keep both when touching the worker.
3. **Effects are returned, never polled.** `KernelProxy` methods resolve with the effects of that call;
   do not poll `get_current_state()`.
4. **Each thread reads its own session.** Requests and `trigger_intent` take the channel's session through
   `deps.getAgentSession`, never the global `flowState`/persona. The legacy context mirror is written only
   for the viewed thread.
5. **All model-facing behaviour text goes through `dot-agent-injector.ts`.** Per-turn state is a simulated
   `get_current_state` tool call and result before the last user message, injected only when the last
   message is the user's, recomputed every request, never persisted.
6. **Intent is a tool call, never text.** No `<intent>` tags, no regex over model output.
7. **Do not `await` `addToolOutput`** in the channel controller — it deadlocks. Auto-steps are capped
   (`MAX_AUTO_STEPS`) and each assistant message resubmits at most once.
8. **Chat routes run on the Edge runtime and stream through `streamAgentResponse`**
   ([`lib/server/agent-stream.ts`](lib/server/agent-stream.ts), `streamText`). Keep `onError` on the UI
   stream so the real error reaches the client (ADR-0006).
9. **Reasoning stays out of message text.** The custom route folds `reasoning_content` into `<think>`
   (`withReasoningContentAsThink`) and `extractReasoningMiddleware` splits it out; the client stores it in
   `thinkingLog`. That route must stay on `custom.chat()` — the Responses API drops `reasoning_content`.
10. **Agents are persisted to be recovered, kernel state is not.** `agentBundles` (keyed by
    `conversationId`) and `recentAgents` keep the bundle; a reload revives the agent at its initial state.
11. **`types/kernel-effect.d.ts` and `.js` are tsc output** of `npm run electron:compile`, which strips the
    SPDX line from the `.d.ts`. Edit `types/kernel-effect.ts`; do not commit a regenerated `.d.ts` that lost
    its header.
12. **System agents** in [`agents/`](agents/) are packed into `public/agents/*.agent` only by
    `npm run build:agents`; nothing runs it automatically, and both sides are committed.
13. **License headers** are mandatory; the pre-commit hook and CI enforce them — rules in
    [`CONTRIBUTING.md`](CONTRIBUTING.md#committing-code). Never remove or alter an existing header.

## Electron

| Concern | Rule |
|---|---|
| WASM | `asarUnpack` must keep `**/*.wasm` and `**/dot-agent-kernel/**` ([`electron-builder.yml`](electron-builder.yml)). |
| Server | Packaged builds run the Next.js standalone server via `utilityProcess.fork` on a free `127.0.0.1` port ([`electron/next-server.ts`](electron/next-server.ts)). LLM calls go through it, not IPC. |
| IndexedDB | The store lives in Electron's per-app partition, not the origin's: a browser tab on the same `localhost:3000` reads a different, usually empty, copy. Verify real data in the Electron window's DevTools. |
| Release channels | Driven by the git tag; `electron/updater.ts` derives the channel from the build's version. **Never tag a prerelease off `main`.** Procedure: [`CONTRIBUTING.md`](CONTRIBUTING.md). |

## Agent config

Skills live in `.agents/skills/<verb>/SKILL.md`; `.claude/skills/<verb>` is a relative symlink to it.
Never put the real file under `.claude/`. To verify a UI or chat change, use the `verify` skill.

## Troubleshooting an agent that does not transition

1. **Tool in the request?** The request to `/api/chat/<provider>` must carry `trigger_intent` with a
   non-empty intent enum; if not, the channel's session has no valid intents.
2. **Did the model call it?** The flow event cards (or the debug panel) show `send_intent`. A model that
   never calls it needs a clearer goal, guide or knowledge — or a stronger model (README, Known limitations).
3. **Rejected intent?** The controller rejects intents not valid in the current state; check the state's
   `allowed_intents` in the injected payload.
4. **Packaged app only?** WASM not loading means `asarUnpack` lost its entries.

## Keeping this file current

Update this file as part of any task that changes what it describes:

- a file named in *Source of truth* moves or is renamed;
- an ADR is added or supersedes 0007;
- an invariant above stops holding, or a new "this breaks if…" is found;
- the worker, the injector, the channel controller or the chat routes change shape;
- an IndexedDB store is added, or the Electron server/updater mechanics change.

Adjust the one affected line, keep entries short, and mention the edit in the task's summary.
