<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

# Plan-018: Align murici with dot-agent's canonical content paths

| Field | Value |
|---|---|
| Status | Backlog |
| Created | 2026-07-15 |
| Author | Danilo Borges |
| Depends on | dot-agent-spec: "guide/teach resolved by explicit path" fix (`@dot-agent/compiler`, Unreleased) |

---

## Summary

This is a **briefing that originates from the dot-agent-spec side**, not an already-explored murici implementation plan. The dot-agent `pack` had a bug: it derived a content file's namespace from the *keyword* (`teach`→`knowledge/`, `guide`→`guides/`) and prepended it to the reference text. Because every agent writes the path already prefixed (`teach "knowledge/x.md"`), bundles came out with **doubled** paths (`knowledge/knowledge/x.md`) and guides landed in the wrong namespace. The fix (already applied in dot-agent-spec) adopts the **explicit-path** model: a reference is a path relative to the agent root, bundled verbatim; the namespace comes from the path, not the keyword. New bundles now have canonical paths (`knowledge/x.md`).

murici carries defensive code that existed **only because of that bug**, plus a resolution gap that was the "broken in murici" note commented into one of the examples. This plan lists what to review on the murici side — **without assuming the current internal structure**; confirm each point before changing it.

## Goals

- Remove/evaluate the `resolveTeach` fallback that masked the double-nesting, without breaking older bundles still in use.
- Close the `guide`-as-file resolution gap (today only `teach` becomes content), which is the "broken in murici".
- Repack `public/agents/onboarding.agent` with the fixed CLI (the committed artifact still carries double-nested paths).

## Scope

### In Scope
- `lib/runtime/advance-flow.ts` (`resolveTeach`, and the effects → `BehaviorStateInfo` transform).
- Repack of the committed bundle under `public/agents/`.
- A test asserting resolution against a canonical bundle.

### Out of Scope
- The pack fix itself (already done in dot-agent-spec).
- Bumping the pinned `@dot-agent/*` versions (unless the cleanup requires it; see Open Questions).

## Design

### 1. `resolveTeach` fallback (double-nesting band-aid)
In `lib/runtime/advance-flow.ts` (~L26-31), `resolveTeach` matches the `teach` effect's text against the bundle paths with three checks:

```ts
k.path === name ||
k.path === `knowledge/${name}` ||   // <- band-aid: only matched because of knowledge/knowledge/
k.path.endsWith(`/${name}`)
```

With canonical bundles, the `teach` effect emits `knowledge/x.md` and the bundle holds `knowledge/x.md` → the primary check `k.path === name` already resolves. The other two checks compensated for the doubled path and for bare names.

**Suggestion** (confirm first): simplify to a deterministic match (e.g. normalize by stripping a redundant `knowledge/`/`guides/` prefix + exact match), dropping the fuzzy `endsWith`, which can resolve the wrong file when two subdirectories share a basename. **Mind backward-compat**: if double-nested bundles still circulate in `public/agents/` or in users' IndexedDB, keep tolerance or repack them all before removing the fallback.

### 2. Gap: `guide`-as-file is not resolved
`buildFlowStateFromEffects` (~L49-54) resolves **only** the `teach` effect to content (`resolveTeach(effects.find(e => e.type === "teach")?.text, …)`); the `guide` effect is passed through raw. When a `.behavior` uses `guide "guides/x.md"` (a file reference, which the compiler supports), murici shows the **literal path** instead of the content. This is exactly the `//guide "kitchen-guardrails.md" - broken in murici` comment in the Fridge Assistant example.

**Suggestion**: resolve `guide` against `bundle.files.guides` the same way `teach` resolves against `knowledge` (the "is it a file?" heuristic is the `.md`/`.txt` suffix, same as the compiler). Decide whether guide-file content becomes an inline `guide` or a separate field in `BehaviorStateInfo`.

### 3. Repack the committed bundle
`public/agents/onboarding.agent` was packed with the buggy CLI 0.11.0 → it has `knowledge/knowledge/*.md`. Repack with the fixed CLI (`dot-agent pack --dir agents/onboarding-agent --out public/agents/onboarding.agent`) once the fix ships, and check `unzip -l` (should be `knowledge/x.md`, single).

## Success Criteria

- `resolveTeach` resolves a canonical bundle (`knowledge/x.md`) without relying on the `knowledge/${name}` fallback.
- A `.behavior` with `guide "guides/x.md"` shows the file **content** in murici, not the path.
- `public/agents/onboarding.agent` repacked with no double-nesting; onboarding runs the same in the browser.
- No older bundle in use breaks (or all have been repacked).

## Tracks

### Track 1 — resolveTeach cleanup
- Confirm whether double-nested bundles are still in use (public/agents, IndexedDB).
- Simplify `resolveTeach` to a deterministic match; add a test with a canonical bundle.

### Track 2 — guide-as-file
- Resolve a `guide` effect that references a file against `bundle.files.guides`.
- Decide the shape in `BehaviorStateInfo`; E2E test with the Fridge example (unlock the guardrails).

### Track 3 — repack artifacts
- Repack `public/agents/*.agent` with the fixed CLI; verify the layout.

## Open Questions

- Bump the `@dot-agent/*` pin? The fix is in the compiler/CLI; murici loads pre-built bundles via kernel-dsl 0.10.1, which round-trips the new bundles perfectly (verified). So the murici cleanup **does not require** a bump — but resolving `guide`-as-file is pure murici code, independent of the pinned version.
- Backward-compat: how many double-nested bundles exist in real users' IndexedDB? That decides whether the fallback can be dropped or only simplified.

## Related

- dot-agent-spec: `@dot-agent/compiler` CHANGELOG (Unreleased) — "guide/teach by explicit path"; `apps/dot-agent-cli/src/commands/mcp-run.ts` (same lookup cleanup, already done there).
