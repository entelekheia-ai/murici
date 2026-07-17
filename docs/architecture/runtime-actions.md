# Runtime Actions

> A `.agent` package can ask its host to perform deterministic UI actions — open the model selector, reveal a settings panel. This document defines the **runtime action** contract: a vendor-neutral, namespaced vocabulary that any runtime implements or gracefully ignores. Murici is one such runtime; the vocabulary is meant to outlive it.

---

## The runtime-as-browser model

A `.agent` is to a runtime what a web page is to a browser. The page calls standardized APIs (`window.open`, `navigator.*`); the browser implements them; if an API is missing the page feature-detects and degrades. **Runtime actions are the same idea for agents:** the agent emits a named action from a known vocabulary, the runtime executes it if it has the capability, and does nothing (a no-op) if it does not.

Murici is deliberately *one runtime among many* — the goal is a portable `.agent` ecosystem where the same package behaves sensibly across different hosts, the way a web page renders across browsers.

### Consequence: no vendor prefixes

Runtime action names are **vendor-neutral**. There is no `murici:*` namespace. The web already ran this experiment with CSS `-webkit-` / `-moz-` prefixes and concluded it was a mistake: prefixes fractured the platform and everyone eventually migrated to unprefixed standard names gated by feature detection. We start where the web ended up.

An action being "Murici-specific today" is a statement about **capability coverage** (few runtimes implement it yet), not about its name. The name stays neutral; feature detection — the graceful no-op below — is what handles a runtime that lacks the capability.

## Naming convention

```
<domain>:<object>-<verb>
```

- **domain** — the area of the runtime the action targets: `chat`, `settings`, …
- **object** — what the action acts on: `models-selector`, `mcp`, `agents-details`, …
- **verb** — the operation, using the term common in the surrounding UI market. For "surface this UI", the verb is **`open`** (uniformly — we do not distinguish `show`/`reveal` for panels vs `open` for modals; one verb, less to remember).

Names are lowercase, `kebab-case` within each segment.

## Capability layers

The vocabulary spans two layers. The distinction is documentary — it guides which actions a new runtime should prioritize — and is **not** encoded in the name.

- **Core** — capabilities most chat runtimes can reasonably provide (e.g. model selection). A portable `.agent` should be able to lean on these.
- **Runtime-specific (today)** — capabilities only some runtimes have (e.g. the dot-agent FSM detail panel, MCP configuration). A `.agent` that uses these should assume they may no-op elsewhere.

An action can graduate from runtime-specific to core as the capability spreads across the ecosystem — without any rename.

## The dispatcher

Murici routes actions through a single seam: `lib/runtime/runtime-actions.ts`.

- It holds the **canonical vocabulary** — the one source of truth that this document mirrors and that validation reads from.
- `dispatchRuntimeAction(action)` validates the action against the vocabulary, then re-dispatches it as a `window` CustomEvent **named exactly the same string**. Unknown actions are a no-op plus a debug log — this *is* the feature-detection / graceful-degradation behavior.
- Each UI surface **implements** the action it owns by listening for that event (e.g. the model selector listens for `chat:models-selector-open`). Implementation is decentralized; the vocabulary is centralized.

Because the action name and the event name are identical, there is no translation table to keep in sync.

```
.agent behavior         →  emits "chat:models-selector-open"
runtime-actions.ts      →  in vocabulary? → window.dispatchEvent(CustomEvent("chat:models-selector-open"))
chat-settings.tsx       →  addEventListener("chat:models-selector-open", openSelector)
```

## Vocabulary (v0)

| Action | Layer | Meaning |
|---|---|---|
| `chat:models-selector-open` | core | Open the model picker for the current chat. |
| `chat:agents-details-open` | runtime-specific | Reveal the agent details panel (dot-agent FSM state / graph). |
| `settings:mcp-open` | runtime-specific | Open the MCP server configuration. |
| `settings:ai-helper-open` | runtime-specific | Open the background AI-helper (auto-task) configuration. |

New actions are added here and to `runtime-actions.ts` together.

## Transport (temporary)

Runtime actions currently ride on the DSL's `run script` effect: a behavior writes `run script "chat:models-selector-open"`. This is a **stopgap**. In the `.agent` spec, `run script` is intended for *executing external scripts* (webhooks, commands — real side effects in the world), which is a different capability from invoking a deterministic host UI action. Conflating them is a category error we are choosing to carry only until the spec separates the two (a dedicated `run action` / `invoke` effect, still backlog upstream).

When that lands, Murici swaps the transport — the vocabulary and the dispatcher stay exactly as they are. `run_script` handling in `lib/kernel-effects.ts` is the single point that will change.

## Forward directions (not yet implemented)

- **Parameterized actions.** Today's actions are argument-free (`open X`). Some will need a payload — `settings:theme-set` needs a theme value; `chat:models-selector-open` might want a model to preselect. The current single-string transport can't carry that; a parameterized form (structured payload alongside the action name) is a design task for when the first such action arrives.
- **Runtime → agent events.** The flow is one-way today (agent asks the runtime to act). The browser model has the reverse axis too — the host telling the page that something happened ("user closed the panel", "user selected model X"). A symmetric event channel back into the FSM is the natural next step.

## Related

- Plan-017 — Per-Thread Agent Presentation-Effects Pipeline (implements the dispatcher and wires it into both kernel-call paths).
- Plan-007 — GenUI & Web Components (the richer presentation effects — `apply html`, Shadow-DOM widgets — that will share this runtime seam).
- [dot-agent DSL Support](./dot-agent-dsl-support.md) — which slice of the `.agent` DSL Murici exposes today.
