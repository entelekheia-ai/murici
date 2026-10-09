---
vibe-ops-template: task@3
---

# Task: Graph identifiers and the cerrado adapter

| Field | Value |
|---|---|
| Status | In Progress |
| Created | 2026-10-08 |
| Author | Danilo Borges |
| Issue | pending |
| Plan | [plans/020-the-knowledge-graph-moves-to-cerrado.md](../plans/020-the-knowledge-graph-moves-to-cerrado.md), Track 2 (identifiers and adapter half) |

---

## Context

Plan-020 Track 2, the half that is code: `lib/knowledge/ref.ts` and `lib/knowledge/cerrado-adapter.ts`
with unit tests, `@entelekheia/ref-id` added as a dependency, and the vis-network canvas moved onto the
same identifiers. The `.cmap` and `.cview` files are the other half of the track and are written in the
main loop after this lands.

Gate: `npm test`, `npm run type-check`, `npm run lint`.

Files owned: `lib/knowledge/ref.ts`, `lib/knowledge/cerrado-adapter.ts`, their tests under
`__tests__/lib/knowledge/`, `package.json`, `package-lock.json`, `jest.config.mjs` (only if the ESM
package needs a transform entry), `components/knowledge/knowledge-graph-canvas.tsx` (identifier
construction and the click branch only).

## Work items

| # | Priority | Item | Effort |
|---|---|---|---|
| 1 | P0 | `lib/knowledge/ref.ts` — the only place that builds or parses a graph identifier | S |
| 2 | P0 | `lib/knowledge/cerrado-adapter.ts` — records to cerrado `GraphData` | M |
| 3 | P0 | The vis-network canvas takes its ids from `ref.ts` | S |

### 1. `ref.ts` — P0

**What:** `@entelekheia/ref-id@0.7.1` pinned exactly. `ref.ts` exports builders
`conversationRef(chatId)`, `knowledgeRef(recordId)`, `agentRef(bareAgentId)` and one parser
`parseGraphRef(id)` returning `{ kind: "conversation" | "knowledge" | "agent", key: string } | null`.
**Why:** one module owns the identifier format, so a later change of `ref:` type touches one file.
**Change:** identifiers are

| Entity | Identifier |
|---|---|
| Conversation | `ref:unknown:murici:conversations/<chatId>` |
| Knowledge record | `ref:unknown:murici:knowledge/<record.id>` |
| Agent | `ref:unknown:dot-agent:<namespace>/<name>` — the bare id `agent-layer.ts` already computes, no version |

Each builder builds through `@entelekheia/ref-id` and parses the result back; a string that fails either
throws in development and is caught by the tests. A key containing a character the locator grammar
refuses is encoded the way `@entelekheia/ref-id`'s own builder does, never by a hand-written escape.

### 2. Adapter — P0

**What:** `buildGraphData({ knowledge, agentBundles, chats })` returns cerrado's `GraphData`
(`import type { GraphData } from "@entelekheia-ai/cerrado/spec"`).
**Why:** both renderers and the map need one projection of the records.
**Change:**

- Nodes: one per conversation that the vis-network canvas shows today, one per knowledge record, one per
  agent from `buildAgentLayer` (hidden agents stay hidden). `type` is `conversation`, `knowledge` or
  `agent`; a record's own `nodeType` goes to `attrs.nodeType`. `label` is the same text the vis-network
  canvas shows (title or name, untruncated — truncation is a renderer concern). `createdAt` from the
  record when it has one.
- Edges: knowledge → conversation `type: "generated_in"`; agent → conversation `type: "ran_in"`;
  agent → knowledge `type: "produced"`. The same pairs the vis-network canvas draws today
  (`intra-`, `agent-conv-`, `agent-know-`).
- Pure: no DOM, no GPU, no IndexedDB call.

### 3. vis-network canvas — P0

**What:** `knowledge-graph-canvas.tsx` builds its node ids with `ref.ts` instead of the `conv-`, `know-`
and `agent-` template strings, and its click branch dispatches on `parseGraphRef(id).kind`.
**Why:** the two renderers share one source of identifiers.
**Change:** identifiers and the click branch only — colours, placement, physics and lenses unchanged.
Edge ids inside vis-network stay whatever string is unique; nothing outside the canvas reads them.

## Implementation order

- [x] P0 — `ref.ts` and its tests
- [x] P0 — adapter and its tests (fixture: every node kind, the hidden `BackgroundSystem` agent, an agent id
      carrying `:v~digest`, a Sourcehut namespace with `~`)
- [x] P0 — vis-network canvas on `ref.ts`

## Surprises & Discoveries

- Ruling: the agent node's identifier carries no version — `agent-layer.ts` deduplicates agents by
  namespace and name on purpose (one node per agent, whatever build produced an artifact), and an
  unversioned identifier names the living agent the way an unversioned Package URL names the living
  package — cost if wrong: a later per-version view needs a second identifier, derived the same way.
- Ruling: node `type` is one of cerrado's three literals (`conversation`, `knowledge`, `agent`) and the
  record's `nodeType` moves to `attrs` — the map routes on three kinds and a view can still select on the
  subtype with `attr` — cost if wrong: a region per record subtype needs a routing rule on `attr` rather
  than on `type`.
- Ruling: the vis-network canvas keeps building its own nodes and takes only the identifiers from
  `ref.ts`, rather than drawing the adapter's output — that is what makes the identifiers shared, while
  leaving its colours, placement and lenses untouched until it is only a fallback — cost if wrong: the
  two renderers can disagree on which nodes exist, which the adapter tests do not catch.
- Observation: the `unknown` locator grammar (`spec/ref-id.json`, `dispatch.unknown.pattern`) admits only
  `[A-Za-z0-9._-]` segments, so a Sourcehut namespace (`~user/Name`) cannot be built — and the builder
  never encodes a locator (`dist/build.js`: "a locator is never encoded"), contrary to the item 1
  wording. `agentRef` throws on it; `canRefAgent` reports it.
- Ruling: an agent whose bare id the grammar refuses is left out of the adapter output and the vis-network
  canvas, with its edges (a throw would blank the whole graph) — cost if wrong: that agent is invisible
  until the question on the Sourcehut namespace is answered.
- Ruling: a conversation with no matching chat row gets no `label` in the adapter (the canvas fallback is a
  translated string the pure adapter has no access to) — cost if wrong: a renderer shows the id.
- Ruling: `countParentsByArtifact` (`agent-layer.ts`, not owned) still returns `conv-`/`agent-` strings;
  the canvas translates them at its one consumption site — cost if wrong: two prefix conventions coexist
  until agent-layer returns structured parents.
- Observation: `convAgentId` in the canvas maps to the full `aboutme.id` but `agentColor` is keyed by the
  bare id, so the agent-lens colour of a conversation falls back to `LOW_TIER_COLOR` (predates the track).

- Observation: verified by the caller — `npx jest` 26 suites / 136 tests pass, `npm run type-check` exit 0;
  `npm run lint` exited 1 once with no error text and 0 on three reruns of `npx oxlint`, the same
  intermittent exit the implementer saw.
  Evidence: `build({type:"unknown",locator:"dot-agent:~user/Name"})` throws "refused at the locator";
  `dot-agent:acme/Name` builds.
- Deferred minor: `countParentsByArtifact` (`lib/knowledge/agent-layer.ts`) still returns `conv-`/`agent-`
  strings, translated at its one use site in the canvas.
- Deferred minor: the canvas `convAgentId` map holds the full `aboutme.id` while `agentColor` is keyed by
  the bare id, so a conversation's agent-lens colour always falls back to `LOW_TIER_COLOR`; this predates
  the track.

- Ruling: `murici.cmap` has three territories — Agents, Conversations, Knowledge — routed by `type`, with
  relations conversation–knowledge 0.7, agent–conversation 0.4, agent–knowledge 0.3 — a region per agent
  cannot be declared, because a map is static and the agents are data — cost if wrong: agents of one
  kind of work are not grouped spatially; a later map can route by `attr` once agents carry a domain.
- Ruling: the three lenses follow the engine's own conversations and agents sample lenses — hierarchy
  roles and `edge_roles` hide or lighten each edge pair as the vis-network lenses did; `hidden` keeps the
  edge in the physics — cost if wrong: the layout differs from vis-network's even where the look matches.
- Ruling: no lens declares `canvas_background` or icons — the host takes the page colour from the app's
  light or dark theme, and icons would need the icon font loaded — cost if wrong: Track 3 adds both.
- Ruling: colour is per tier, not the vis-network per-conversation palette — a `.cview` cannot assign a
  colour per node from insertion order — cost if wrong: conversations are no longer told apart by colour.
- Observation: map and lenses verified — `__tests__/lib/knowledge/murici-map.test.ts` routes every node of
  the adapter's output (no `null`), every tier of every lens holds a node, the three lenses draw the same
  node ids and edge count, and no top-level or distortion key is dropped; gate: 27 suites / 145 tests,
  type-check 0, oxlint 0.

- Observation: review of Tracks 1–2 (no blocker, no major) — five minors and three notes. Fixed here: the
  lens tests now assert which node type each lens puts in each tier and compare every written key at any
  depth in `targets`, `distortion`, `theme` and `paint` (both proven by breaking `agent.cview` on purpose:
  a swapped tier and `mass_multiplyer` each fail the suite); the always-green "same nodes in every lens"
  test was dropped; `drawableRecords` in `lib/knowledge/ref.ts` leaves out a record or bundle whose id the
  grammar refuses, in the adapter and the canvas alike, instead of throwing and blanking the graph;
  `CONTRIBUTING.md` says local installs need a `read:packages` token.
- Deferred minor: no test compares the vis-network canvas's node set with the adapter's; by reading they
  agree (same `involvedChatIds`, `buildAgentLayer`, `canRefAgent`, `drawableRecords`).
- Deferred minor: `canary.yml`'s `canary-install.mjs` step carries no `NODE_AUTH_TOKEN`; it installs only
  `@dot-agent/*` from npmjs, so it should not need one — add it if the first CI run returns 401.

- Ruling: agents follow the identifier scheme's own mapping of the dot-agent namespace tiers (`url`,
  `email` with the name as fragment, `unknown` with the `dot-agent` species), replacing
  `ref:unknown:dot-agent:<namespace>/<name>` — the scheme's documentation and vectors already settled it,
  and the Sourcehut agents the first form refused now get an identifier — cost if wrong: the `email`
  form has no vector of its own; it is the scheme's `email` type with the agent's name as the declared
  name inside the address.
- Observation: the maintainer pointed at the identifier scheme's documentation; `docs/reference/the-ref-scheme.md`
  records `dot-agent` retired as a type in its 1.4.0, and the vectors carry
  `ref:url:mentor.pessoal.agent/MentorUniversitario@1.4.1` and `ref:unknown:dot-agent:doctor@v1.0`.
  Both bundled agents declare `domain entelekheia.ai`, so they are `ref:url:entelekheia.ai/<name>`.

- Ruling: the `path=` value is the folder of the `.agent` file, `\` written as `/` and a Windows drive
  letter lowercased; for an agent opened more than once the most recent `recentAgents` record wins —
  cost if wrong: an agent re-opened from a new folder moves to a new node, and its old layout position is
  lost.
- Observation: verified with the scheme's `verdict` — two `path=` values differing with neither `origin=`
  nor `state=` give identity `distinct`; `state=` alone gives `same`; `corpus=` gives `undetermined`.

## Closure

- [x] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      happens.
