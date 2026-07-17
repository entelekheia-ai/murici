# Plan-017: Per-Thread Agent Presentation-Effects Pipeline

| Field | Value |
|---|---|
| Status | Backlog |
| Created | 2026-07-15 |
| Author | Danilo Borges |
| Depends on | ADR-0007 (per-thread chat channels) |
| Related | Plan-006 (onboarding agent — supersedes its "CSS Scope Persistance" section), Plan-007 (GenUI & Web Components), Plan-014 (channel-store consumer migration), [Runtime Actions](../../docs/architecture/runtime-actions.md) |

---

## Summary

Agent behaviors emit two kinds of effects that change how Murici looks and behaves while the user talks to an agent: **declarative presentation state** (`apply css` / `remove css`, later `apply html`) and **runtime actions** (`run script "chat:models-selector-open"` and friends — deterministic host UI actions). Two structural gaps make both misbehave: (1) they are only processed on the agent's **initial load**, not on the FSM advances (`send_intent`) that drive the actual conversation, so most per-state effects never fire; and (2) the CSS effects mutate `document.head` **globally**, with no per-thread scoping and no teardown on chat switch, so the onboarding theme "leaks" into every other chat and never goes away.

This plan replaces the ad-hoc `applyKernelCss`/`handleKernelEffects` calls with a single **unidirectional pipeline**: declarative effects are folded into **per-thread desired presentation state** in the channel store, and one React **reconciler** materializes only the *viewed* thread's state into the DOM; runtime actions are routed through a single vendor-neutral **dispatcher** (see [Runtime Actions](../../docs/architecture/runtime-actions.md)). This fixes the leak, makes per-state effects fire, and establishes the runtime foundation that Plan-007 (GenUI / Shadow-DOM widgets) will build on.

## Goals

- The set of agent-injected `<link>` stylesheets in `document.head` is **always exactly** the viewed thread's desired set — switching away from the onboarding chat removes its theme, switching back restores it.
- `apply css` / `remove css` / runtime actions fire from **any** FSM state, whether reached at load time or via `send_intent` mid-conversation.
- A chat's presentation effects that fire **while it is in the background** update its own per-thread state without touching what the user is looking at.
- Declarative effects (CSS, future HTML) and runtime actions are handled by clearly separated mechanisms, so adding `apply html` later is a parallel field + parallel reconciler, not another refactor.
- Runtime actions go through one vendor-neutral vocabulary + dispatcher, so they are enumerable, feature-detected (unknown → no-op), and portable across runtimes.
- No `!important`-driven global leakage regressions; behavior is covered by an off-screen regression test.

## Scope

### In Scope
- Per-thread desired-CSS state in `lib/store/channel-store.ts` (in-memory only).
- A pure effect fold + a DOM reconciler in `lib/kernel-effects.ts`.
- Effect ingestion on **both** kernel-call paths: initial load (`agent-session-provider.tsx`) and FSM advance (`channel-controller.ts`).
- A single React reconciler component (DOM sink) keyed on the viewed thread.
- A vendor-neutral runtime-action vocabulary + dispatcher (`lib/runtime/runtime-actions.ts`) per [Runtime Actions](../../docs/architecture/runtime-actions.md), replacing today's hardcoded `run_script` target strings; renaming the four existing targets to the namespaced vocabulary and updating the onboarding `.behavior` files to match.
- Unit tests for the fold + store action + dispatcher validation; a Playwright off-screen leak regression test.

### Out of Scope
- Persisting presentation state across app reloads. It stays in-memory, consistent with today's kernel/FSM state, which also resets to the initial state on reload (only the `.agent` bundle is persisted). See ADR-0007 / `agent-session-provider.tsx` revival note.
- `apply html` / GenUI widgets / Shadow DOM (Plan-007). This plan only leaves the seam for them.
- Bundling `css/` inside the `.agent` package (compiler v0.2 concern). Stylesheets keep being served statically from `public/agent-styles/`.
- Multi-agent / subagent topology (Plan-015). `threadId === agentSessionId` still holds.

## Design

### The invariant

> The set of `link[id^="dot-agent-css:"]` in `document.head` equals `activeCss[viewedThreadId]` — nothing more, nothing less.

Everything below exists to keep that invariant true through loads, FSM advances, and chat switches.

### Data flow (unidirectional)

```
FSM effects  (apply_css / remove_css / run_script)
   │   emitted on BOTH paths:
   │     • load_behavior      → agent-session-provider.tsx (React)
   │     • send_intent advance → channel-controller.ts (vanilla, per-channel)
   ▼
channel-store.activeCss[threadId]: string[]     ← per-thread DESIRED state (source of truth)
   │                                              (background threads update here too, no DOM)
   ▼
KernelPresentationHost (one React reconciler)   ← DOM sink; materializes ONLY activeCss[viewedThreadId]
```

### Declarative effects vs runtime actions

Two kinds of effects, handled by two mechanisms:

- **Declarative presentation state** (`apply_css`, `remove_css`, future `apply_html`): accumulate into per-thread desired state. Materialized by the reconciler, for the viewed thread only. Order-preserving (CSS cascade: later `apply` wins).
- **Runtime actions** (carried today by `run_script`; deterministic host UI actions): fire-once, for the **viewed/active** thread only — a background onboarding step must not yank open a panel while the user looks at another chat. Routed through the vendor-neutral vocabulary + dispatcher in [Runtime Actions](../../docs/architecture/runtime-actions.md), so a single `dispatchRuntimeAction(action)` works identically from React and from the vanilla controller.

The four current actions are renamed to the namespaced vocabulary:

| Old `run_script` target | Runtime action | Implementer (event listener) |
|---|---|---|
| `open_agents_panel` | `chat:agents-details-open` | `AgentSessionProvider` → `setShowRightSidebar(true)` |
| `open_model_selector` | `chat:models-selector-open` | `chat-settings.tsx` (already listens) |
| `open_mcp_config` | `settings:mcp-open` | `profile-settings.tsx` (already listens) |
| `open_settings_auto_task` | `settings:ai-helper-open` | `profile-settings.tsx` (already listens) |

### `channel-store.ts` — per-thread desired CSS

Add a field and an action, mirroring the existing `flowEvents` per-thread pattern (keyed by `threadId`, capped/deduped, returns the same state object when nothing changes so subscribers don't re-render spuriously):

```ts
activeCss: Record<string, string[]>            // threadId -> ordered stylesheet filenames

ingestCssEffects(threadId, effects): void      // folds apply_css/remove_css into activeCss[threadId]
```

`dropChannel` deliberately does **not** touch `activeCss` — same reasoning as
`flowEvents` ("a thread's events outlive its channel"). A background thread's
`ChatChannel` unmounts (and disposes/drops) the moment its reply finishes and
it isn't the viewed thread — exactly the off-screen scenario this pipeline
exists for. Clearing `activeCss` on drop would erase an agent's theme the
instant it finished applying it in the background, before the user ever
switched back to see it. (Found via the off-screen Playwright regression test
initially failing on exactly this — see Track 5.)

### `kernel-effects.ts` — pure fold + DOM reconcile

Split today's `applyKernelCss`/`removeKernelCss`/`handleKernelEffects` into concerns:

```ts
foldCssEffects(prev: string[], effects): string[]   // pure: apply → push if absent; remove → filter out
reconcileCssLinks(desired: string[]): void          // diff document.head vs desired; add missing, remove extra
handleRuntimeActions(effects): void                 // run_script effects → dispatchRuntimeAction(target)
```

The `run_script` → hardcoded-CustomEvent logic moves out to the dispatcher (below); `kernel-effects.ts` just forwards each `run_script` target into `dispatchRuntimeAction`.

### `runtime-actions.ts` — vendor-neutral vocabulary + dispatcher

New `lib/runtime/runtime-actions.ts`, the single source of truth for the action vocabulary (see [Runtime Actions](../../docs/architecture/runtime-actions.md)):

```ts
export const RUNTIME_ACTIONS = [
  "chat:models-selector-open",
  "chat:agents-details-open",
  "settings:mcp-open",
  "settings:ai-helper-open"
] as const

dispatchRuntimeAction(action: string): void   // if action ∈ RUNTIME_ACTIONS → window CustomEvent(action); else no-op + debug log
```

Because the action name *is* the event name, there is no translation table. Listener changes:

- `chat-settings.tsx`: `murici:model-selector-open` → `chat:models-selector-open` (1:1 rename).
- `profile-settings.tsx`: **today it has a single `murici:profile-open` listener that reads a `detail.tab` param** (`profile-settings.tsx:98-106`) — `open_mcp_config` dispatched `{detail:{tab:"mcp"}}`, `open_settings_auto_task` dispatched no detail (default `"profile"` tab). Under the new vocabulary these become **two distinct events**: listen for `settings:mcp-open` (→ open on the MCP tab) and `settings:ai-helper-open` (→ open on the auto-task/AI-helper tab). This drops the magic `detail.tab` in favor of the action name carrying the intent. ⚠️ Verify the exact tab key for the AI-helper section — the old `auto_task` path opened the default `"profile"` tab, which may be a pre-existing imprecision to confirm against the tab list.
- `AgentSessionProvider` gains a **new** listener for `chat:agents-details-open` that flips `setShowRightSidebar(true)` (replacing the old direct-setter path for `open_agents_panel`).

### Ingestion sites

- **Load** — `agent-session-provider.tsx` `loadBehavior`: replace the single guarded `handleKernelEffects(...)` call with `channelStore.getState().ingestCssEffects(chatKey, effects)` (**always**, even when the target chat is in the background) plus `if (isActive()) handleRuntimeActions(effects)`.
- **Advance** — `channel-controller.ts`, right after `const effects = await engineFsm.send_intent(intentName)`: `channelStore.getState().ingestCssEffects(this.threadId, effects)` (always) plus `if (this.deps.isViewed()) handleRuntimeActions(effects)`. The controller already has `this.threadId`, `deps.isViewed()`, and imports `channelStore`.

### Reconciler + panel bridge

- New `components/utility/kernel-presentation-host.tsx`, mounted once at `app/[locale]/layout.tsx:100` (right where `AgentSessionProvider` wraps `{children}`, independent of whether `RightSidebar` is mounted). Subscribes to `activeCss[viewedThreadId]` via `useShallow` (import from `zustand/react/shallow` — confirmed zustand 5.0.14) for reference stability, runs `reconcileCssLinks(desired)` in an effect on change. Re-runs both when `viewedThreadId` changes and when the viewed thread's desired set changes (an FSM advance while viewing). ⚠️ Selecting `s.activeCss[viewedThreadId]` returns a fresh array/`undefined` each store update — `useShallow` (or selecting `[viewedThreadId, activeCss]` and deriving) is required to avoid a render loop.
- `AgentSessionProvider` (already mounted, already holds `setShowRightSidebar`) gains a `chat:agents-details-open` window listener that flips `setShowRightSidebar(true)`, mirroring the existing listeners in `chat-settings.tsx` / `profile-settings.tsx`.

### `.behavior` updates

The onboarding agent's `main.behavior` / `onboarding.behavior` change their `run script "open_*"` lines to the namespaced vocabulary (`chat:agents-details-open`, `chat:models-selector-open`, `settings:mcp-open`, `settings:ai-helper-open`), then repack. This is what makes the mid-flow actions actually resolve once the advance path processes them.

## Success Criteria

- Open the onboarding chat, advance a few steps (theme applied), switch to a normal chat: `document.head` has **zero** `dot-agent-css:` links. Switch back: the onboarding theme reappears.
- Advancing the onboarding FSM (e.g. `welcome → welcome.agent_format`) while a **different** chat is on screen changes `activeCss[onboardingThread]` in the store but does **not** alter the DOM until that thread is viewed.
- A runtime action (`chat:models-selector-open`, `chat:agents-details-open`) in a mid-flow state (reached via `send_intent`) actually opens the corresponding UI — for the viewed chat only.
- An unknown runtime action is a silent no-op (debug log only), never a crash.
- `foldCssEffects`, `ingestCssEffects`, and `dispatchRuntimeAction` (known → event, unknown → no-op) unit tests pass.
- The off-screen Playwright regression test fails against the pre-fix code and passes after.

## Tracks

### Track 1 — Per-thread presentation state (store)
- 1.1 Add `activeCss` field + `ingestCssEffects` action to `channel-store.ts`; NOT cleared in `dropChannel` (see Design).
- 1.2 Extract `foldCssEffects` pure helper (used by the action).
- 1.3 Unit tests for `foldCssEffects` and `ingestCssEffects`.

### Track 2 — Effect handlers (DOM sink + runtime actions)
- 2.1 Add `reconcileCssLinks(desired)` to `kernel-effects.ts`; keep `applyKernelCss`/`removeKernelCss` as internals it uses.
- 2.2 New `lib/runtime/runtime-actions.ts`: `RUNTIME_ACTIONS` vocabulary + `dispatchRuntimeAction` (validate → CustomEvent; unknown → no-op + debug log). Unit test.
- 2.3 Convert `handleKernelEffects` → `handleRuntimeActions` (forwards `run_script` targets into `dispatchRuntimeAction`).
- 2.4 Update existing listeners (`chat-settings.tsx`, `profile-settings.tsx`) to the namespaced event names.

### Track 3 — Wiring both kernel-call paths
- 3.1 `agent-session-provider.tsx` `loadBehavior`: ingest CSS always + runtime-actions-if-active.
- 3.2 `channel-controller.ts` advance: ingest CSS always + runtime-actions-if-viewed.

### Track 4 — Reconciler + bridge
- 4.1 New `kernel-presentation-host.tsx` reconciler component; mount at root.
- 4.2 `chat:agents-details-open` listener in `AgentSessionProvider`.

### Track 5 — Behaviors + verification
- 5.1 Update onboarding `.behavior` files to the namespaced runtime actions; repack.
- 5.2 Playwright off-screen leak regression (SSE stub per the ADR-0007 channel-agent-isolation pattern).
- 5.3 Manual verify in the real Electron app: onboarding theme scoped per chat, mid-flow runtime actions fire.

## Dependencies

- ADR-0007 (per-thread channels) — the store, `ChannelController`, and `viewedThreadId` this plan extends.
- No external dependencies. `apply_css`/`remove_css` effect types already exist in `types/kernel-effect.ts`; `public/agent-styles/*.css` already served.

## Open Questions

- Should `reconcileCssLinks` guarantee `<head>` ordering matches the desired array exactly (re-inserting to reorder), or only guarantee set membership (add missing / remove extra)? Set membership is simpler and sufficient unless two agent stylesheets have conflicting rules on the same selector. Default: set membership; revisit if a real cascade conflict appears.
- When `apply css` names a file already present in a thread's set, keep its position or move to end? Default: keep position (avoid surprising cascade reorders).
- **Parameterized runtime actions** (deferred, tracked in [Runtime Actions](../../docs/architecture/runtime-actions.md)): the current `run script "<string>"` transport carries no payload, so all four v0 actions are argument-free. The first action that needs an argument (e.g. `settings:theme-set`) forces a payload design — out of scope here, noted so the vocabulary isn't accidentally locked into string-only.

## Related

- Plan-006 — onboarding agent. Its "CSS Scope Persistance" note and "Feasibility Analysis: `apply css`" section described this fix against the pre-ADR-0007 architecture (`selectedChat`, IndexedDB, `use-chat-handler.tsx`) and are **superseded** by this plan.
- Plan-007 — GenUI & Web Components. This pipeline is the per-thread runtime those richer effects (`apply html`, Shadow-DOM widgets) will plug into.
- Plan-014 — channel-store consumer migration. `activeCss` is another slice of state landing in the store as the legacy mirror is retired.
