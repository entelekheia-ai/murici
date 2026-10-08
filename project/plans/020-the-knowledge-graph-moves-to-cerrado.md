---
vibe-ops-template: plan@3
---

# Plan-020: The knowledge graph moves to cerrado

| Field | Value |
|---|---|
| Status | Backlog |
| Created | 2026-10-08 |
| Author | Danilo Borges |
| Depends on | The repository's own upgrade to TypeScript 7 (in progress); `@entelekheia-ai/cerrado` with `Engine.destroy()` and `onDeviceLost` (Track 4) |

---

## Summary

The knowledge graph — the landing screen of an empty chat and the `/graph` page — is drawn today by
vis-network, with a canopy and a gradient ring painted by hand on its canvas. This plan moves it to
`@entelekheia-ai/cerrado`, a WebGPU engine that draws the graph as a landscape declared in two files: a
`.cmap` that says where each node lives and a `.cview` that says how it looks. vis-network stays, but only
as the fallback for a machine where WebGPU has no adapter or the GPU device is lost; the rest of the app
never learns which of the two is drawing.

## Goals

1. On a machine with a WebGPU adapter, both mounts of the graph — `/[locale]/[workspaceid]/graph` and the
   empty-chat landing — are drawn by cerrado.
2. Without an adapter, or after the GPU device is lost, the same mount shows the vis-network graph with
   the same nodes and the same click behaviour, without a reload.
3. A click on a conversation, knowledge or agent node does what it does today: open the chat, the
   preview modal or the agent overlay.
4. The three lenses — default, chat, agent — exist in cerrado as three `.cview` files over one `.cmap`,
   and switching between them morphs rather than remounts.
5. Navigating between `/chat` and `/graph` any number of times leaves no engine, listener or GPU device of
   an earlier mount alive.

## Scope

### In scope

- Installing `@entelekheia-ai/cerrado` from GitHub Packages, locally and in CI.
- An adapter from the records `useKnowledgeData` already returns to cerrado's `GraphData`.
- `murici.cmap` and three `.cview` lenses.
- A cerrado canvas component, a fallback selector, and the vis-network canvas kept as the fallback.
- Layout persistence for cerrado in IndexedDB.
- Tests for the adapter and an end-to-end test for mount, unmount and fallback.

### Out of scope

- **Removing vis-network.** It is the fallback, not dead code; a later plan removes it once the fallback
  is never taken.
- **Refreshing the graph after a write.** `useKnowledgeData` reads IndexedDB once on mount today
  (`lib/hooks/use-knowledge-data.ts:12-27`); that stays as it is.
- **Classification ids (`scheme:id`, Wikidata QIDs) on nodes.** cerrado's routing rules match on node
  `type` as well, and the existing `conv-`/`know-`/`agent-` prefixes are enough to route.
- **The TypeScript 7 upgrade itself**, which is its own work and a prerequisite of Track 1.

## Design

### Who draws

`KnowledgeHomeView` (`components/knowledge/knowledge-home-view.tsx`) renders a new `KnowledgeGraph`
instead of `KnowledgeGraphCanvas`. `KnowledgeGraph` owns the choice: it mounts `CerradoGraphCanvas`
first, and switches to the existing `KnowledgeGraphCanvas` (vis-network,
`components/knowledge/knowledge-graph-canvas.tsx`) when cerrado's `init()` throws — no `navigator.gpu`,
no adapter, or no canvas context — or when `onDeviceLost` fires. Both canvases take the same props: the
records from `useKnowledgeData`, the chats from `ChatbotUIContext`, and the three click handlers. The
choice is made once per mount and is not persisted, so a machine that gains an adapter uses it on the
next mount.

```mermaid
flowchart TD
  M[KnowledgeGraph mounts] --> C[CerradoGraphCanvas: new Engine, init]
  C --> T{init throws?}
  T -- yes --> V[KnowledgeGraphCanvas: vis-network]
  T -- no --> R[render; lenses morph]
  R --> L{onDeviceLost?}
  L -- yes --> D[engine.destroy] --> V
  L -- no --> U{unmount?}
  U -- yes --> X[engine.destroy]
```

### Data in

`lib/knowledge/cerrado-adapter.ts` turns the records into cerrado's `GraphData` (`nodes`, `edges`) with
the same ids the vis-network canvas builds today: `conv-<chatId>`, `know-<record.id>`,
`agent-<bareAgentId>`, and the edges `intra-`, `agent-conv-` and `agent-know-`. Each node carries a
`type` — `conversation`, the record's `nodeType`, or `agent` — which is what `murici.cmap`'s routing rules
match. The agent layer is reused from `lib/knowledge/agent-layer.ts` (`buildAgentLayer`), so the hidden
`BackgroundSystem` agent stays hidden in both renderers. The adapter is pure and has no GPU or DOM
dependency, which is what lets it be unit-tested.

### Map and lenses

`lib/knowledge/graph/murici.cmap` declares the regions (conversations, knowledge artifacts, agents), the
routing by `type`, and a `default_region`. `default.cview`, `chat.cview` and `agent.cview` reproduce the
current lenses (`knowledge-graph-canvas.tsx:668-779`: mass re-weighting, recolouring, which edges show).
All three are written with cerrado's `authoring-a-map` and `authoring-a-view` skills, and validated with
`validateMap`/`validateView` against data from the adapter. A lens switch calls `morphTo`, which needs the
same node count across lenses; the adapter therefore emits every node in every lens, and a lens hides by
tier, never by omission.

### Events out

cerrado reports `onClick` and `onHover` with a node index; `scene.meta[i].id` turns it into the prefixed
id, and the existing click branch (`knowledge-graph-canvas.tsx:781-809`) moves into a shared
`handleGraphClick(id)` that both canvases call. Hover shows the node kind, as today.

### Layout

cerrado solves a layout once per (map, view), freezes it and asks an injected `LayoutStore` to persist
it. The store is backed by a new IndexedDB object store, `graphLayouts`, keyed by map and view, added
through the existing schema migration in `lib/local-db/schema.ts`. A reload then renders the same
landscape instead of re-solving it. A new store is one of the changes the repository's `AGENTS.md` asks to be recorded, so Track 3
updates it.

### Lifecycle

`CerradoGraphCanvas` creates the `Engine` in an effect and calls `engine.destroy()` in that effect's
cleanup. React 18's StrictMode mounts effects twice in development, which exercises exactly this path on
every load. Until a cerrado release carries `destroy()`, Track 3 runs on `0.2.0` without it; Track 4 makes
the cleanup real.

### Installing the package

`@entelekheia-ai/cerrado` is private on GitHub Packages. A committed `.npmrc` maps the `@entelekheia-ai`
scope to `https://npm.pkg.github.com` and reads the token from an environment variable, never from the
file. CI and the Electron release workflow get a token with `read:packages`. The package is bundled by
Next's webpack into the renderer, so `scripts/verify-electron-deps.js` and the electron-builder `files`
allowlist are checked rather than assumed to need no change.

## Tracks

- [ ] **Track 1 — The package installs.** `.npmrc`, the CI and release-workflow token, and
  `@entelekheia-ai/cerrado@0.2.0` pinned exactly in `package.json`. Acceptance: `npm ci` succeeds locally
  and in CI, `npm run build` and `npm run electron:build` succeed with the package imported from a
  throwaway call site, and `scripts/verify-electron-deps.js` passes.
- [ ] **Track 2 — Adapter, map and lenses.** `lib/knowledge/cerrado-adapter.ts` with unit tests over a
  fixture of records (every node kind, the hidden agent, an agent id carrying `:v~digest`), and
  `murici.cmap` plus the three `.cview` files. Acceptance: the adapter tests pass, and `validateMap` and
  `validateView` report no error against the adapter's output for the fixture.
- [ ] **Track 3 — cerrado draws, vis-network falls back.** `KnowledgeGraph`, `CerradoGraphCanvas`,
  `handleGraphClick`, the `graphLayouts` store, and the fallback on `init()` failure. Acceptance: in a
  browser with WebGPU the graph is drawn by cerrado and each node kind's click does what it does today;
  with WebGPU disabled (`--disable-features=WebGPU`) the vis-network graph appears in the same place.
- [ ] **Track 4 — Lifecycle.** Bump to the cerrado prerelease that ships `destroy()` and `onDeviceLost`,
  call `destroy()` on unmount, and fall back on device loss. Acceptance: a Playwright test navigates
  between `/chat` and `/graph` ten times and then asserts one live engine; a second test forces device
  loss and asserts the vis-network graph is shown.
- [ ] **Track 5 — Verified in the real app.** The maintainer launches the packaged Electron build on each
  desktop OS it ships to and records which renderer each one used. Acceptance: the record names the
  renderer per OS; any OS that fell back is listed in Outcomes with the reason `init()` gave.
- [ ] Run `/vibe-ops:close-plan` — retrospective against the goals, the demotion check. The plan file
      itself is kept. Stays unchecked until the plan is actually closed.

## Success criteria

- `npm test` passes, including the adapter tests.
- The Playwright suite passes, including the navigation and device-loss tests of Track 4.
- `npm run electron:build` produces a build that opens on the graph drawn by cerrado on a machine with a
  WebGPU adapter.
- `grep -rn "vis-network" components/` names only `knowledge-graph-canvas.tsx`, the fallback.

---

## Decision Log

- Decision: cerrado replaces vis-network as the default renderer; vis-network stays only as the fallback
  when WebGPU has no adapter or the device is lost.
  Rationale: Electron's Chromium exposes WebGPU, but an adapter is not guaranteed — blocklisted GPUs,
  virtual machines and parts of Linux return none — and cerrado is WebGPU only by design.
  Date / Author: 2026-10-08 / Danilo Borges
- Decision: the package comes from GitHub Packages at an exact version, not through a `file:` link.
  Rationale: a `file:` link resolves only on a machine with the engine's checkout beside this one, which
  CI and the release build do not have.
  Date / Author: 2026-10-08 / Danilo Borges
- Decision: teardown belongs to the engine (`Engine.destroy()`), not to a singleton kept alive here.
  Rationale: the graph mounts and unmounts on every navigation between the chat and the graph page; a
  workaround here would be maintained by every future consumer of the engine as well.
  Date / Author: 2026-10-08 / Danilo Borges
- Decision: delegation split — Track 2's adapter and its tests go to an implementer subagent behind
  `npm test`; the `.cmap` and `.cview` files, Track 3's fallback selection and Track 4's lifecycle stay
  in the main loop; each track's diff is reviewed by a reviewer subagent before it merges; Track 5 is the
  maintainer's, because this environment cannot open an Electron window.
  Rationale: the adapter is mechanical under the id scheme written in Design; the map, the lenses and the
  fallback are judgements about how the graph should look and behave.
  Date / Author: 2026-10-08 / Danilo Borges

## Outcomes & Retrospective

*Not started.*

---

## Open questions

- Whether Electron 43's Chromium, with `sandbox: true`, exposes a WebGPU adapter on Linux for the
  machines this app ships to. Track 5 measures it.
- How conversation nodes are placed in the map: one region for all conversations, or a region per
  agent that produced them. Decided while writing `murici.cmap` in Track 2.
