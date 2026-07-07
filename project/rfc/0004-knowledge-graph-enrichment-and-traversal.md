<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0
-->

# RFC-0004: Knowledge Graph — Enrichment & Traversal

| Field | Value |
|---|---|
| Status | Draft (v1+ roadmap) |
| Created | 2026-06-19 |
| Author | Danilo Borges |
| Depends on | [RFC-0002](./0002-knowledge-graph-data-model.md) — Data Model |
| Depends on | [RFC-0003](./0003-knowledge-graph-navigation-ui.md) — Navigation UI |
| Related | [dot-agent-spec RFC-0014](../../dot-agent-spec/rfcs/0014-data-contract.md) — Data Contract |
| Related | [dot-agent-spec RFC-0012](../../dot-agent-spec/) — Cognitive Memory Landscapes |

---

## Summary

This RFC specifies the v1+ evolution of the knowledge graph: semantic clustering of nodes into groups, graph edges from kernel-emitted `complete` effects (RFC-0014), the `remember()` LLM traversal tool, multi-conversation node refinement, and the `memory_summarizer` background synthesis pipeline. Nothing here is required for the v0 launch — everything depends on RFC-0002 and RFC-0003 being stable.

---

## Motivation

RFC-0002 and RFC-0003 establish the foundation: knowledge nodes are created, stored, and navigated. But the nodes are isolated — there are no semantic connections between them, no way for the LLM to traverse the graph, and no structural awareness of which nodes relate to which domains.

This RFC closes those gaps, enabling:
1. **The LLM to load context from the graph at runtime**, instead of requiring the user to manually provide context at the start of every chat
2. **Typed artifacts** from agent runs (not just free-form fenced blocks)
3. **Semantic grouping** so the graph becomes a cognitive landscape, not just a flat list of nodes
4. **Multi-agent collaboration** on the same artifact across time

---

## Part 1 — Typed Artifacts via RFC-0014

When the kernel implements `complete CapabilityName with Type` (RFC-0014), it emits a `Complete` effect:

```ts
// New effect type in @dot-agent/sdk
{ type: "Complete", capabilityName: string, outputType: string, payload: unknown }
```

The Murici runtime handles this effect by:
1. Creating a `KnowledgeRecord` with:
   - `outputType` = the declared DSL type name (e.g. `"BookingConfirmation"`)
   - `payload` = the typed, kernel-validated payload object (replaces `GeneralContent`)
   - `agentRuns[0].role = "produced"`
2. Updating `nodeType` based on the type's `category` Wikidata anchor (heuristic mapping, v1)

The `payload` field in `KnowledgeRecord` becomes polymorphic:

```ts
payload: GeneralContent | Record<string, unknown>
// GeneralContent for fenced-block extraction (RFC-0002)
// Typed DSL object for kernel-emitted Complete effects (this RFC)
```

The `content: string` representation for display is derived by the runtime from the typed payload — the rendering strategy depends on `outputType` and `language` within the payload if present.

### Artifact Lineage (`derivedFrom`)

When the kernel tracks that a `Complete` effect consumed data from a previous artifact (via `artifact.remember()` or explicit `derived_from` in the `.behavior`), it includes source node IDs in the effect:

```ts
{ type: "Complete", ..., derivedFrom: ["node-uuid-1", "node-uuid-2"] }
```

Murici stores these in `KnowledgeRecord.derivedFrom[]` and adds `derived_from` edges in the graph canvas, making the lineage visually traceable.

---

## Part 2 — The `remember()` Traversal Tool

`remember()` is a runtime-registered LLM tool that enables zero-context session starts. The LLM can call it when it needs historical context:

```
User: "qual foi o lucro da venda do carro?"
LLM:  [calls remember("venda carro")]
Runtime: → semantic search on KnowledgeRecord.summary
         → finds node "Relatório lucro Honda Civic"
         → fetches node + its conversation context snippet
         → returns to LLM as tool result
LLM:  responds with the answer using retrieved context
```

### Implementation

**Tool registration (Murici → LLM):**

```ts
{
  name: "remember",
  description: "Search your long-term knowledge graph for relevant past outputs and context.",
  parameters: {
    query: { type: "string", description: "What to look for" },
    nodeTypes: { type: "array", items: { type: "string" }, description: "Filter by node type" },
    limit: { type: "number", default: 5 }
  }
}
```

**Resolution pipeline (Murici runtime):**

1. **Ontological filter (deterministic):** if the active agent has a `category` anchor in its `.description`, filter nodes to the same Wikidata category branch first
2. **Semantic search (probabilistic):** match `query` against `summary` text across filtered nodes (vector embedding search or BM25 in v1; client-side fuzzy search in v0.5 prototype)
3. **Lineage expansion:** for each matched node, include its `derivedFrom` ancestors (up to depth 2) to provide procedence context
4. **Return:** array of `{ node: KnowledgeRecord, conversationSnippet: string }` — the LLM receives the node content + the surrounding conversation context

### Session start without context

The user opens a new chat. The LLM's system prompt includes:

```
You have access to a knowledge graph from past conversations.
Use the `remember` tool when you need historical context.
You do not need the user to paste previous outputs — retrieve them yourself.
```

This enables the vision stated at the start of the project: start a chat at zero context, let the LLM assemble what it needs.

---

## Part 3 — Semantic Clustering (Dynamic Groups)

Nodes with semantic affinity are grouped into clusters — the equivalent of "workspaces" in the old model, but discovered dynamically rather than created manually.

### Cluster detection

A background job runs after each new knowledge node is saved:

```
1. Fetch all KnowledgeRecord.summary values
2. Call LLM: "Given these summaries, assign the new node to an existing cluster or name a new one.
              Existing clusters: {cluster names}. New node summary: {summary}.
              Respond: { cluster: string, isNew: boolean }"
3. Store cluster assignment in KnowledgeRecord.clusterId (new field)
4. Update graph canvas: cluster nodes visually group nearby
```

**Model selection:** same rule as title enrichment (RFC-0002) — local model fires automatically; cloud model requires user confirmation or a "✦ classificar" button.

### Cluster as graph layer

In the graph canvas, clusters become a visual overlay (Layer 2 of MAG abstraction):
- Nodes within the same cluster are visually grouped with a soft boundary
- Clicking a cluster → zooms into it and filters the list view
- Clusters can be renamed or manually overridden by the user

### Manual cluster creation

The user can drag nodes together in the graph canvas (v1.1+) to manually assign a cluster, bypassing LLM classification.

---

## Part 4 — Multi-Conversation Node Refinement

In v0, each knowledge node has a single `originConversationId`. In v1+, the same node can be referenced, updated, or refined across multiple conversations.

### Graph edges for cross-conversation touches

When a conversation uses a knowledge node (via `remember()` or manually), a new edge is created:

```ts
interface KnowledgeEdge {
  id: string
  sourceId: string       // KnowledgeRecord id
  targetId: string       // KnowledgeRecord id OR ConversationRecord id
  type: "generated_in" | "derived_from" | "refined_in" | "referenced_in" | "authored_by"
  createdAt: string
  metadata?: Record<string, string>
}
```

This table lives in a new `knowledge_edges` IndexedDB store (version 3 migration).

### Versioning

When an agent updates an existing artifact (`role: "transformed"`), the old payload is preserved in a `versions: GeneralContent[]` array appended to the record. The current `payload` always reflects the latest version. The graph canvas can show a "history" badge on nodes with versions.

---

## Part 5 — `memory_summarizer` Background Pipeline

After a chat session ends (conversation closed or explicit "synthesize" trigger), a background synthesis step produces a richer summary than the per-node LLM call:

```
1. Fetch all KnowledgeRecords from the closing conversation
2. Fetch the conversation's messages (highlights only — not full log)
3. Call LLM: "Synthesize a short paragraph describing what was achieved in this session.
              Focus on the artifacts produced and the decisions made."
4. Store result in ConversationRecord.synthesis (new field)
5. Update each KnowledgeRecord.summary with refined version if synthesis is richer
6. Mark session messages as eligible for garbage collection (sliding window compression)
```

This is the `memory_summarizer.agent` concept from the MAG spec — implemented as a Murici background service rather than a kernel agent, until the sub-agent orchestration layer exists.

**Garbage collection:** compressed messages are not deleted — they're marked `compressed: true` and their content replaced with a pointer to `ConversationRecord.synthesis`. The full content is retained in a `ConversationRecord.archive` blob for recovery.

---

## Part 6 — Graph UI Extensions (v1+)

Extensions to the React Flow canvas introduced in RFC-0003:

| Feature | Description |
|---|---|
| Cluster overlay | Soft boundary around same-cluster nodes |
| `derived_from` edges | Dashed line between knowledge nodes |
| Agent nodes | New node type for agent runs; edges to produced artifacts |
| WebGL renderer | Replaces React Flow when node count exceeds ~500; same data model |
| Territory view | Layer 3 aggregation — multiple clusters into a named territory |
| Zoom levels | Zoom out → clusters; zoom out more → territories; zoom in → individual nodes |
| Temporal timeline | Horizontal time axis in list view; nodes placed by `createdAt` |

### On the WebGL transition

The data model (typed node + edge arrays) is the stable interface. React Flow consumes it in v0. A WebGL renderer (Three.js, Babylon.js, or a custom canvas) will consume the same arrays in v1+. No adapter layer is needed now — the transition is a component swap at the graph canvas boundary.

---

## Relationship to Apuí

Murici exposes the graph explicitly (the user sees nodes and edges). Apuí (the commercial product) transforms the same underlying graph into a cognitive landscape — clusters become "territories," territories become "ecosystems," and the structural topology recedes in favor of semantic meaning.

The data model defined in RFC-0002 through RFC-0004 is **shared between Murici and Apuí**. The differentiation is entirely in the rendering and navigation layer, not in the storage schema. This is the architectural principle stated in RFC-0012: "same cognitive foundation, different visibility."

---

## Open Questions

1. **Vector embeddings in IndexedDB:** client-side semantic search requires embedding vectors stored per node. What's the storage and compute budget for this on a mid-range machine? *Needs benchmarking. Fallback: BM25 text search via a WASM implementation.*

2. **Cluster stability:** LLM-assigned clusters will drift as new nodes are added. Should cluster reassignment be a full recompute or only applied to new nodes? *Tentative: only new nodes; manual re-cluster via UI.*

3. **Edge store timing:** when to introduce the `knowledge_edges` store (DB version 3)? Could be RFC-0002 v2 migration to avoid a second migration. *Deferred — add only when `derived_from` has actual data to write.*

4. **`memory_summarizer` trigger:** on conversation close (implicit) or explicit user action? Implicit risks data loss if the app crashes mid-synthesis. *Tentative: explicit trigger ("Sintetizar sessão" button) in v1; automatic in v1.1 with crash recovery.*
