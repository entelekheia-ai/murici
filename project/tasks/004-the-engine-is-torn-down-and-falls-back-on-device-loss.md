---
vibe-ops-template: task@3
---

# Task: The engine is torn down, and falls back on device loss

| Field | Value |
|---|---|
| Status | In Progress |
| Created | 2026-10-08 |
| Author | Danilo Borges |
| Issue | pending |
| Plan | [plans/020-the-knowledge-graph-moves-to-cerrado.md](../plans/020-the-knowledge-graph-moves-to-cerrado.md), Track 4 |

---

## Context

Plan-020 Track 4: bump to the cerrado prerelease that ships `Engine.destroy()` and `onDeviceLost`
(`@entelekheia-ai/cerrado@0.3.0-alpha.0`), call `destroy()` on unmount, and fall back on device loss.
Acceptance: a Playwright test mounts the graph ten times and asserts one live GPU device; a second test
forces device loss and asserts the vis-network graph is shown.

Gate: `npx jest`, `npm run type-check`, `npx oxlint`, and
`npx playwright test knowledge-graph-lifecycle --project=chromium` — which skips both tests on a machine
without a WebGPU adapter, so a GPU-less CI run never exercises this acceptance.

Files owned: `package.json`, `package-lock.json`, `components/knowledge/cerrado-graph-canvas.tsx`,
`__tests__/playwright-test/tests/knowledge-graph-lifecycle.spec.ts`.

## Work items

| # | Priority | Item | Effort |
|---|---|---|---|
| 1 | P0 | Pin `@entelekheia-ai/cerrado@0.3.0-alpha.0` | S |
| 2 | P0 | Unmount calls `destroy()`; device loss destroys and falls back | S |
| 3 | P0 | Playwright lifecycle spec | M |

### 1. Pin — P0

**What:** `npm install --save-exact @entelekheia-ai/cerrado@0.3.0-alpha.0`.

### 2. Teardown and device loss — P0

**What:** the effect's cleanup calls `engine.destroy()` whether or not the engine started (it is
idempotent and releases listeners, frame loop and device). `onDeviceLost` destroys the engine and calls
`onUnavailable`, so `KnowledgeGraph` renders the vis-network canvas in the same place.

### 3. Playwright spec — P0

**What:** an init script wraps `GPUAdapter.prototype.requestDevice` to count live devices and keep the
last one. Test one toggles List and Graph ten times and asserts one live device; test two destroys the
device from outside the engine and asserts `.vis-network` appears and no device is left. Chromium only,
with the flags cerrado's own GPU tests use; skipped where no adapter exists.

## Implementation order

- [x] P0 — pin
- [x] P0 — teardown and device loss
- [x] P0 — Playwright spec

## Surprises & Discoveries

- Ruling: Track 4 runs in the main loop, as the plan's Decision Log reserves it — cost if wrong: none.
- Ruling: the "ten navigations between `/chat` and `/graph`" of the acceptance are ten unmounts of the
  graph by the home view's List/Graph toggle inside one page — a full navigation reloads the page and frees
  every device with it, so only an in-page unmount can show a leak — cost if wrong: a leak specific to the
  route change between `/chat` and `/graph` would go unseen.
- Observation: the spec guards what it claims — with the cleanup changed back to `stop()`, the ten-mount
  test fails with 11 live devices (expected 1); with `destroy()` both tests pass (2 passed, 16.6 s).
- Observation: the Playwright Chromium headless shell for this Playwright version was not installed;
  `npx playwright install chromium` fetched it. A role query for "Agent" also matched the sidebar's
  "dot-agent" section, so the spec queries buttons by exact name.

- Observation: review of Track 4 (no blocker, no major). Fixed: the spec keeps every device and destroys
  the one still live, rather than the last one requested, which a StrictMode double mount could make an
  already-released device; the final counts wait with `expect.poll`, since a mount cancelled mid-init
  releases its device only when its own init settles. Recorded: the spec skips without an adapter.
- Observation: Track 4 also closes two of Track 3's deferred minors — the per-remount device leak, and a
  throw from `start()` skipping the loop's stop — since the cleanup now always calls `destroy()`.

## Closure

- [x] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      happens.
