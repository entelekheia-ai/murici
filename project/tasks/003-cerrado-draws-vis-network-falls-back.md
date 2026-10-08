---
vibe-ops-template: task@3
---

# Task: cerrado draws, vis-network falls back

| Field | Value |
|---|---|
| Status | In Progress |
| Created | 2026-10-08 |
| Author | Danilo Borges |
| Issue | pending |
| Plan | [plans/020-the-knowledge-graph-moves-to-cerrado.md](../plans/020-the-knowledge-graph-moves-to-cerrado.md), Track 3 |

---

## Context

Plan-020 Track 3: `KnowledgeGraph`, `CerradoGraphCanvas`, a shared click handler, layout persistence, and
the fallback to the vis-network canvas when cerrado's `init()` fails. Acceptance: in a browser with WebGPU
the graph is drawn by cerrado and each node kind's click does what it does today; with WebGPU disabled the
vis-network graph appears in the same place.

Gate: `npx jest`, `npm run type-check`, `npx oxlint`, then a browser check through `chrome-devtools-mcp`
against `next dev`, with WebGPU available and with it disabled.

Files owned: `components/knowledge/knowledge-graph.tsx` (new), `components/knowledge/cerrado-graph-canvas.tsx`
(new), `components/knowledge/use-graph-click.ts` (new), `lib/knowledge/graph/sources.ts` (new),
`types/cerrado-sources.d.ts` (new), `components/knowledge/knowledge-home-view.tsx`,
`components/knowledge/knowledge-graph-canvas.tsx` (click branch only), `next.config.js` (one webpack rule),
`jest.config.mjs` (one mapping), tests under `__tests__/`.

## Work items

| # | Priority | Item | Effort |
|---|---|---|---|
| 1 | P0 | The map and lenses reach the bundle as text | S |
| 2 | P0 | One click handler for both canvases | S |
| 3 | P0 | `CerradoGraphCanvas` mounts the engine the way the engine's sample host does | M |
| 4 | P0 | `KnowledgeGraph` picks the renderer and falls back | S |
| 5 | P0 | Verified in a browser, with and without WebGPU | M |

### 1. Sources — P0

**What:** a webpack rule `{ test: /\.c(map|view)$/, type: "asset/source" }` in `next.config.js`, a module
declaration for `*.cmap` and `*.cview` as `string`, and `lib/knowledge/graph/sources.ts` exporting the map
text and the three lens texts keyed `default | chat | agent`. Jest maps the two extensions to a transform
that returns the file's text.
**Why:** the files stay in their own format, which the cerrado skills and validators read.

### 2. Click — P0

**What:** `useGraphClick()` returns `(id: string) => void`: a conversation pushes the chat route, a
knowledge record opens the preview, an agent opens the agent overlay — the branch now at
`knowledge-graph-canvas.tsx:783-811`, moved, and called by both canvases.

### 3. `CerradoGraphCanvas` — P0

**What:** a client component that, in one effect: imports the engine dynamically (no server render touches
`navigator.gpu`), builds `GraphData` with `buildGraphData`, parses the map and lenses, and mounts:
`new Engine(canvas)` → `await init()` → `loadFont` → the map's `zoom` copied into `fitMargin`,
`maxMagnification`, `camera.elastic` → `buildScene` → `restoreLayout` from the saved layout when one exists
→ `setBackground` from the page's computed background colour → `setCanopyConfig(scene.paint)` → `setGraph`
→ `simulate = true`, `canopy = true`, `requestFit()` → `freeze()` when the layout was fully restored →
`setLabels` (territory names on each region's node indices, and node captions where the lens's zoom bands
show them) → `start()`. `onSettle` saves the layout; `onHover` sets the hovered node's kind for the
subtitle; `onClick` calls `useGraphClick` with `scene.meta[i].id`. The lens buttons call a switch that
copies the sample host's: `buildScene` → `morphTo(scene.nodes, scene.paint)` → `setEdges` →
`glideToFit()` → `setLabels`. Unmount calls `stop()` (teardown arrives in Track 4). Any throw before
`start()` calls `onUnavailable(reason)`.

### 4. `KnowledgeGraph` — P0

**What:** renders `CerradoGraphCanvas`; on `onUnavailable` it renders `KnowledgeGraphCanvas` in the same
place with the same props, for the rest of that mount. `KnowledgeHomeView` renders `KnowledgeGraph`.

### 5. Browser check — P0

**What:** `next dev`, records seeded into the page's IndexedDB, then: the canvas is cerrado's (no
vis-network canvas in the DOM), each node kind's click does its action, a lens switch morphs; then with
WebGPU disabled the vis-network canvas appears.

## Implementation order

- [ ] P0 — sources
- [ ] P0 — click
- [ ] P0 — `CerradoGraphCanvas`
- [ ] P0 — `KnowledgeGraph` and the home view
- [ ] P0 — browser check

## Surprises & Discoveries

- Ruling: the layout is persisted in `localStorage`, not in a new IndexedDB store — cerrado's
  `LayoutStore` is the synchronous Web Storage slice (`getItem`/`setItem`/`removeItem`), and Electron keeps
  `localStorage` in the same per-app partition as IndexedDB — cost if wrong: layouts share the 5 MB
  `localStorage` quota with the rest of the app; one layout is a few kilobytes per (map, view).

## Closure

- [ ] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      happens.
