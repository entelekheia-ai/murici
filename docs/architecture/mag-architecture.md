<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0
-->

# Multi-layered Artifact Graphs (MAG) — Architecture

> This document is the canonical reference for Murici's memory architecture. It covers the cognitive model, node taxonomy, graph structure, and the product differentiation between Murici and Apuí. For implementation specifics, see the RFCs.

---

## The Core Shift

Most AI systems treat memory as hidden infrastructure. Users interact with conversations while the actual knowledge structure remains invisible. This creates predictable failures: poor discoverability, fragmented context, inability to reuse past outputs.

Murici and Apuí adopt a different model: **memory is a first-class interface**.

The insight that drives the entire architecture:

> **The Artifact — the achieved output — is the unit of memory. Not the conversation.**

Sessions exist to produce artifacts. Once produced, an artifact outlives the session and enters the graph as a persistent node. Future sessions retrieve context from the graph, not from chat history.

---

## The Cognitive Triad

Memory is structured around three interconnected entities:

### Session (Conversational Channel)

The volatile, linear stream of interactions. Carries temporal metadata (timestamps, active agents) and a sliding window of recent messages. Sessions are ephemeral — they exist to produce Artifacts and are compressed after synthesis.

### Agent (Cognitive Operator)

The executor carrying domain expertise, behavior definitions, and interaction records. An agent knows which other agents it collaborated with to construct an artifact. Multiple agents can contribute to a single artifact across multiple sessions.

### Artifact / Knowledge Node

The deterministic output of fulfilled work: a code snippet, a financial report, a recipe, a travel itinerary, a written analysis. It is a persistent node in the global graph. Artifacts do not disappear when a session ends.

### The N:M:N Mapping

A single Artifact can be built, reviewed, or refined across multiple Sessions by multiple Agents. A single Session can yield multiple Artifacts.

```
Session A ──┐                    ┌── Session B
            ├──→ Artifact X ←───┤
Agent 1 ────┘                    └── Agent 2
```

This N:M:N structure is what distinguishes MAG from a simple chat log: the graph explicitly tracks which agent modified which artifact, in which session, and at what timestamp.

---

## Node Taxonomy

Nodes in the graph are typed. Each type represents a different kind of cognitive entity.

| Node Type | Description | v0 status |
|---|---|---|
| `knowledge` | Free-form content produced in chat: code, analysis, documents | ✅ implemented |
| `document` | Structured file-like artifact: reports, contracts, specs | Roadmap |
| `task` | A defined unit of work — assigned, in-progress, or completed | Roadmap |
| `automation` | A scheduled or triggered agent execution | Roadmap |
| `entity` | A named real-world concept: person, product, place, company | Roadmap |
| `conversation` | A session — also a node, navigable and linkable | ✅ implemented |
| `agent` | An agent identity that participated in producing nodes | Roadmap |

In v0, all extracted fenced blocks are `knowledge` nodes. The taxonomy expands as Murici gains more surfaces for creating typed artifacts.

---

## Edge Taxonomy

Edges are directed and typed, recording why two nodes are connected.

| Edge Type | Source → Target | Meaning |
|---|---|---|
| `generated_in` | Knowledge → Conversation | This node was created during this session |
| `derived_from` | Knowledge → Knowledge | This node used data from that node as input |
| `refined_in` | Knowledge → Conversation | This node was updated during this (later) session |
| `referenced_in` | Knowledge → Conversation | This node was retrieved and used (via `remember()`) |
| `authored_by` | Knowledge → Agent | This node was produced by this agent |

In v0, only `generated_in` edges exist. Others are populated as the kernel (`complete` effects, RFC-0014) and `remember()` tool (RFC-0004) are implemented.

---

## Abstraction Layers

The graph can be visualized at four levels of abstraction. Murici exposes all four; Apuí de-emphasizes the lower layers.

### Layer 1 — Nodes

Individual knowledge nodes and conversations. The user sees each explicitly.

*Examples: "Relatório lucro Honda Civic", "Roteiro Portugal 2025", "Componente AuthButton"*

### Layer 2 — Clusters

Groups of semantically related nodes, discovered by LLM classification or user-defined.

*Examples: "Finanças pessoais", "Projeto Murici", "Receitas fermentadas"*

### Layer 3 — Territories

Large cognitive regions formed by multiple clusters.

*Examples: "Vida pessoal", "Trabalho", "Projetos técnicos"*

### Layer 4 — Ecosystems

The highest-order view — personal knowledge domains.

*Examples: "Conhecimento pessoal", "Pesquisa", "Desenvolvimento de produto"*

---

## Graph Traversal — `remember()`

The `remember()` tool enables the LLM to retrieve context from the graph at runtime, without the user needing to provide it manually. This is what makes zero-context session starts possible.

```
User: "qual foi o lucro da venda do carro?"

LLM calls: remember("venda carro")
Runtime:
  1. Ontological filter: if agent has a category anchor, restrict to same domain
  2. Semantic search: match query against KnowledgeRecord.summary
  3. Lineage expansion: include derivedFrom ancestors (depth 2)
  4. Return: node content + surrounding conversation snippet

LLM responds with retrieved context — no copy-paste from the user required.
```

The traversal is hybrid: **deterministic** for graph structure (which nodes are connected), **probabilistic** for semantic match (which nodes are most relevant).

---

## Background Synthesis

Memory synthesis is decoupled from the main interaction thread to avoid latency.

**Per-artifact enrichment (RFC-0002):** immediately after a knowledge node is created, a background LLM call generates `title` and `summary`. This is the minimum viable synthesis.

**Session synthesis (`memory_summarizer`, RFC-0004):** after a session closes, a background pipeline:
1. Parses the session log
2. Extracts structural facts and decisions
3. Merges lineage connections into the artifact graph
4. Produces a `ConversationRecord.synthesis` paragraph
5. Compresses raw messages (pointer to synthesis, original retained in archive)

This mirrors the approach used by Letta's memory compression pipeline and Zep's background graph ingestion — both validated in production. The MAG distinction: the synthesis pipeline will eventually be expressible as a first-class `.behavior` file, not framework-internal infrastructure.

---

## Murici vs. Apuí — Product Differentiation

The same underlying graph substrate powers both products. The differentiation is experiential, not architectural.

| Capability | Murici | Apuí |
|---|---|---|
| Memory Graph | ✅ | ✅ |
| Agents | ✅ | ✅ |
| Knowledge nodes | ✅ | ✅ |
| Context management | ✅ | ✅ |
| Explicit nodes + edges | Primary interface | Secondary / hidden |
| Cognitive clusters | Basic | Primary |
| Territory / Ecosystem views | Limited | Primary |
| Semantic landscape navigation | Basic | Advanced |
| LLM-driven context assembly | ✅ | ✅ |

**Murici:** the user sees the trees. The graph is explicit, inspectable, educational.
**Apuí:** the user sees the forest. The graph recedes; meaning and context are foregrounded.

Same data. Different windows.

---

## Implementation Roadmap

| Component | RFC | Status |
|---|---|---|
| `KnowledgeRecord` schema + IndexedDB | [RFC-0002](../../_rfc/0002-knowledge-graph-data-model.md) | ✅ Implemented |
| Chat right panel + `/graph` UI | [RFC-0003](../../_rfc/0003-knowledge-graph-navigation-ui.md) | ✅ Implemented |
| `remember()` tool + semantic clustering | [RFC-0004](../../_rfc/0004-knowledge-graph-enrichment-and-traversal.md) | Roadmap v1+ |
| Typed artifacts via kernel `complete` | dot-agent-spec RFC-0014 | Draft (spec level) |
| Session synthesis pipeline | [RFC-0004](../../_rfc/0004-knowledge-graph-enrichment-and-traversal.md) | Roadmap v1+ |
