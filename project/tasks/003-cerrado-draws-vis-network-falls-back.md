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
place with the same props (`knowledge`, `chats`, `agentBundles`, `recentAgents`), for the rest of that
mount. `CerradoGraphCanvas` builds its data with `buildGraphData` including `recentAgents`. `KnowledgeHomeView` renders `KnowledgeGraph`.

### 5. Browser check — P0

**What:** `next dev`, records seeded into the page's IndexedDB, then: the canvas is cerrado's (no
vis-network canvas in the DOM), each node kind's click does its action, a lens switch morphs; then with
WebGPU disabled the vis-network canvas appears.

## Implementation order

- [x] P0 — sources
- [x] P0 — click
- [x] P0 — `CerradoGraphCanvas`
- [x] P0 — `KnowledgeGraph` and the home view
- [x] P0 — browser check

## Surprises & Discoveries

- Ruling: the layout is persisted in `localStorage`, not in a new IndexedDB store — cerrado's
  `LayoutStore` is the synchronous Web Storage slice (`getItem`/`setItem`/`removeItem`), and Electron keeps
  `localStorage` in the same per-app partition as IndexedDB — cost if wrong: layouts share the 5 MB
  `localStorage` quota with the rest of the app; one layout is a few kilobytes per (map, view).

- Ruling: the code of items 1–4 goes to an implementer subagent behind the gate, and item 5 (the browser
  check) stays in the main loop — the fallback choice the plan reserved to the main loop is settled in
  item 3 and 4 above, so what remains is implementation under a written contract — cost if wrong: a
  judgement the dossier left implicit is taken by the implementer and caught only at review.
- Ruling: `useGraphClick(source)` takes the four collections and returns `{ onNodeClick, overlay }`, not a bare
  `(id) => void` — the preview and agent overlay state must live somewhere both canvases share, and the file is
  `.ts`, so the overlay is built with `createElement` — cost if wrong: callers destructure instead of calling.

- Ruling: the Jest transform for `.cmap`/`.cview` lives in a new root file `jest.text-transform.cjs` — a
  transformer must be a file and `jest.config.mjs` cannot hold one inline — cost if wrong: one unlisted file to move.

- Ruling: the canvas element is created inside the effect and removed on cleanup, so a re-run (new props, strict
  mode) gets a fresh canvas — cost if wrong: cerrado 0.2.0 has no `destroy()`, so each run leaves its GPU device alive.

- Ruling: territory labels are a local helper in `cerrado-graph-canvas.tsx` ported from the sample host's
  `territories.ts`; label ink and region darkening follow the page background's luminance — cost if wrong: a dark
  theme's colours may need tuning in the browser check.

- Observation: browser check on `next dev` (Chrome with a WebGPU adapter, records seeded into the page's
  IndexedDB): the graph is cerrado's — one canvas, no `.vis-network` — with the three territories, their
  names, the canopy wash and node captions; hover shows the kind; a click on a conversation navigated to
  `/en/local/chat/c1`, on a knowledge record opened its preview, on an agent opened its overlay
  ("1 conversa(s), 1 artefato(s)"); the Agent lens morphed on the same canvas; the layouts of the three
  lenses were saved under `cerrado.layout.murici_knowledge@1/…`. With `navigator.gpu` removed by an
  init script, the same mount showed the vis-network graph.
- Observation: the `unknown`-namespace agent `loja` opened from a folder rendered as its own node.
- Ruling: icons per node type, at the maintainer's request and in the cerrado renderer only — chat
  `lucide:message-circle`, file `lucide:file-text`, agent `lucide:bot`, declared per tier in each lens's
  theme; the font comes from `lucide-static` (pinned to the `lucide-react` version, 1.53.0) and loads on
  demand with the engine; a failed load draws without icons — cost if wrong: about 290 KB of font fetched
  on the first graph mount.
- Observation: `next dev` on Next 16 appends a block to `AGENTS.md` on every start
  (`node_modules/next/dist/server/lib/generate-agent-files.js`; `agentRules: false` in `next.config`
  turns it off). It was left out of this track's commits.
- Deferred minor: the synthetic pointer events of the browser check raise `setPointerCapture` errors in
  the dev overlay; real pointers do not.

- Observation: review of Track 3 (no blocker, no major), triaged by reading each cited line. Fixed: no
  engine is constructed once the mount is cancelled; the lens buttons stay disabled until the engine has
  started; the reader's last lens is remembered (`murici.graph.lens`), so a reload opens on it and the
  layout saved for that lens is read back — a live switch re-solves by cerrado's design, so without this
  only the default lens's saved layout was ever restored (revises the implementer's ruling 6); the
  component's doc comment sits on the component again; a font face that fails to load is removed.
  Browser re-check: after choosing Agent and reloading, the page opened on Agent.
- Deferred minor: a throw from `start()` itself fires `onUnavailable` while the cleanup skips `stop()`.
- Deferred minor: the effect depends on array identities, so a new `chats` array from the context
  remounts the engine — each remount leaks a GPU device until Track 4 brings `destroy()`.
- Deferred minor: `lucide-static` is pinned exactly while `lucide-react` is `^1.53.0`.
- Deferred minor: no test covers unmount before failure, a lens switch, `saveLayout`, the icon-font
  failure path, or that every prop reaches the fallback.

## Closure

- [ ] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      happens.
