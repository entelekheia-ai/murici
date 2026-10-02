<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0
-->

# MAG Prior Art & Rationale

> This document surveys the memory architecture landscape as of early 2026, positions the Multi-layered Artifact Graph (MAG) approach within it, and records the design rationale for the choices made. It is a living reference — update it as the ecosystem evolves.

---

## The Problem with Linear Memory

Standard LLM architectures treat conversational memory as a sequential history of raw message logs — a sliding window that is continuously re-injected into the prompt. This approach has three compounding failure modes:

**1. Context window suffocation.** Re-injecting goals, guides, raw history, available capabilities, and historical context causes severe attention decay, particularly in faster/smaller models. Even with 1M-token context windows, cost and latency make full-history injection impractical for real usage.

**2. Semantic distance gap.** Standard vector embeddings fail when queries use domain-specific language, metaphors, or imprecise references. "What did we decide about the thing with the numbers?" is not a good vector query.

**3. Fragmentation.** Outputs produced across conversations are siloed. There is no structural connection between "the recipe I developed last month" and "the cooking blog post I wrote yesterday," even though one derived from the other.

---

## The Paradigm Shift: Artifact-Centric Memory

The core insight: **the Artifact (achieved output) is the unit of memory, not the conversation.**

Sessions exist to produce artifacts. Once produced, an artifact is a persistent, typed, semantically-anchored node in a graph. Future sessions retrieve context from the graph — not from raw chat history.

This insight has independent parallels in production systems by early 2026:

---

## Prior Art Survey

### Zep + Graphiti (2025)

A temporally-aware knowledge graph engine. Stores facts with `validFrom` / `validUntil` periods, enabling non-lossy updates and timeline reconstruction.

**Strength:** Excellent temporal conflict resolution. Non-lossy fact updates. Peer-reviewed. Enterprise deployments.  
**Limitation:** ~600K tokens of graph context per conversation — graph-based memory is not always cheaper than vector retrieval at scale.  
**Benchmark:** 94.8% on Deep Memory Retrieval (DMR).  
**Relationship to MAG:** architecturally closest analog. MAG operates at the Artifact level (achieved outcomes) rather than the fact level. Zep tracks that "the price was $200, then $180" — MAG tracks the report that consolidated that decision.

### Letta / MemGPT (2023–2025)

Treats LLM context as virtual memory, actively paging information across three tiers: core memory (always in context), recall memory (searchable), archival memory (cold storage).

**Strength:** Good token efficiency via active context paging. 83.2% on LongMemEval. Active Apache-2.0 community.  
**Limitation:** Own runtime — not framework-agnostic. Memory operations are imperative Python API calls.  
**Relationship to MAG:** Letta's background memory compression pipeline (summarizing episodic memory into semantic facts) is the direct precedent for the `memory_summarizer` pipeline in RFC-0004.

### Mem0 (2024–2025)

A hybrid vector + entity graph memory layer. Extracts facts from conversations and injects relevant context into future prompts. Evolved to include graph variant (Mem0g).

**Strength:** Excellent token efficiency (~1,764 tokens/conversation, 91% reduction vs. full-context). 67.13% on LOCOMO. High production maturity (48K+ GitHub stars, $24M Series A).  
**Limitation:** Resolves temporal conflicts probabilistically (recency bias) without explicit versioning. Memory operations are imperative SDK calls.  
**Relationship to MAG:** Mem0's hybrid vector + graph approach validates the dual-mode (deterministic structure + probabilistic search) design. MAG adds explicit artifact lineage that Mem0 lacks.

### A-MEM (2025, NeurIPS)

A Zettelkasten-inspired agentic memory system. Memories dynamically link to related memories and retroactively refine existing notes.

**Strength:** Dynamic inter-note linking is the closest analog to MAG's `derived_from` edges.  
**Relationship to MAG:** validates the idea of memories linking to each other, not just to conversations.

### LangMem (2025)

LangChain's native memory SDK, integrating episodic, semantic, and procedural memory into LangGraph's state machine model.

**Correction from earlier drafts:** LangGraph does support cross-session memory through its native long-term memory store and persistence layers introduced in 2024–2025. Earlier claims that it had "no cross-session memory" were outdated.  
**Limitation:** LangGraph-native — not framework-agnostic. Memory operations are framework-internal infrastructure that every developer must configure.

---

## Competitive Landscape (Early 2026)

| Dimension | Mem0 | Zep + Graphiti | Letta | LangMem | MAG (.agent DSL) |
|---|---|---|---|---|---|
| Primary abstraction | Memory-as-a-Service SDK | Temporal Knowledge Graph | OS-Inspired Agent Runtime | LangGraph-native Memory SDK | Declarative Cognitive Contracts |
| Memory structure | Hybrid Vector + Entity Graph | Temporally-anchored KG (Neo4j) | Three-tier hierarchy | Episodic + Semantic + Procedural | Multi-layered Artifact Graphs |
| Token efficiency | Excellent (~1,764/conv) | Poor (~600K/conv) | Good (active paging) | Good | Excellent (JIT tooling + summary windows) |
| Cross-session memory | ✅ | ✅ | ✅ | ✅ | ✅ |
| Temporal conflict resolution | Probabilistic (recency) | Excellent (validity periods) | Good (access-pattern paging) | Basic | Excellent (artifact lineage versioning) |
| Framework agnostic | ✅ | ✅ | ❌ | ❌ | ✅ |
| Deterministic validation | ❌ | Partial | ❌ | ❌ | ✅ (strict category anchoring) |
| DSL-level memory syntax | ❌ | ❌ | ❌ | ❌ | ✅ |
| Production maturity | High | High | High | Medium | Specification stage |

---

## MAG's Distinct Contribution

Every system above converges on the same fundamental insight (artifact/fact-centric memory over raw chat history). MAG's distinct contribution is not the graph architecture — it is the **language layer**.

In MAG, memory operations are expressed as **declarative path navigations in a domain-specific language**:

```
// Future .behavior syntax
set context.insight = artifact.remember("travel budget")
```

Rather than imperative Python API calls:

```python
# Mem0
results = memory.search(query="travel budget", user_id="user1")

# LangMem
memories = store.search(("user", user_id), query="travel budget")
```

This is the claim that future versions of the spec should validate empirically: declarative memory syntax reduces the cognitive overhead for agent developers and enables static analysis by the compiler (dead memory references, type mismatches between `remember()` return type and assignment target).

---

## Design Rationale for MAG-Specific Choices

### Why Artifact-level lineage, not fact-level?

Zep/Graphiti tracks facts ("price was $200"). MAG tracks artifacts ("the pricing report that consolidated that decision"). For use cases where the *outcome* evolves over time — financial reports, travel bookings, research documents — artifact-level lineage provides cleaner temporal semantics: you version the whole achieved object, not each individual fact within it.

### Why Wikidata QIDs for category anchoring?

Wikidata provides a stable, multilingual, maintained semantic hierarchy that enables subclass-based compatibility detection between agents. An agent that produces `category: Q177` (financial instrument) can discover other agents producing compatible types without hardcoded type mappings.

**Known limitation:** Wikidata has irregular coverage and update latency. This approach is flagged for revision in a future version. Domain-specific ontologies (schema.org, industry standards) or internal category taxonomies are worth evaluating as alternatives.

### Why deterministic + probabilistic hybrid search?

Pure vector search fails on domain-specific language. Pure graph traversal fails on fuzzy queries. The hybrid:
1. **Deterministic:** category-restricted filter narrows the search space structurally
2. **Probabilistic:** semantic search on `summary` text finds the right node within the filtered space

This mirrors Zep/Graphiti's validated approach, applied at the Artifact level rather than the fact level.

### Why background synthesis, not synchronous?

Synthesis latency (summarizing a session into structured artifacts) ranges from 1–10 seconds depending on session length and model. Blocking the conversational UI on synthesis would destroy the interaction quality. Decoupling synthesis into a background pipeline — triggered on session close or explicit user action — keeps the main thread responsive.

### Why is the Murici implementation not the full MAG spec?

The full MAG spec (kernel-level `complete` effects, `remember()` tool, vector embeddings, `memory_summarizer` pipeline) requires multiple dependent components that are not yet stable:
- RFC-0014 (`complete ... with Type`) is not yet implemented in the kernel
- Vector embedding infrastructure does not exist in Murici
- Sub-agent orchestration is not yet implemented

The v0 implementation (RFC-0002, RFC-0003) is the minimal viable foundation: extract artifacts from fenced blocks, store them as knowledge nodes, display them outside of conversations. Each subsequent RFC adds one layer of the full MAG capability.
