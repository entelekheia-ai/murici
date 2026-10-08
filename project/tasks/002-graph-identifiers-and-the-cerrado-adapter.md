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

- [ ] P0 — `ref.ts` and its tests
- [ ] P0 — adapter and its tests (fixture: every node kind, the hidden `BackgroundSystem` agent, an agent id
      carrying `:v~digest`, a Sourcehut namespace with `~`)
- [ ] P0 — vis-network canvas on `ref.ts`

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

## Closure

- [ ] Run `/vibe-ops:close-task` — do not just delete this file. Stays unchecked until closure actually
      happens.
