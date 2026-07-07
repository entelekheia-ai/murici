# RFC Summary: Murici Knowledge Graph Evolution

## 1. Data Architecture & Lineage
- **Storage:** `Complete` effects store a `Record<string, unknown>` as the Source of Truth.
- **Indexing:** Only the `summary` (strictly limited to ~1 sentence) is used for initial vector/BM25 retrieval.
- **Hydration:** The full `payload` is only fetched/injected into the context when the LLM specifically identifies a node as the primary focus.
- **Lineage:** Supports cyclic relationships in the database, but the `remember()` tool will use a **depth-limit (max 2)** to prevent infinite recursion during context retrieval.
- **Identification:** `node_id` is the absolute anchor. If the system can identify an ID, it bypasses text-based ambiguity.

## 2. The `remember()` Tool Logic
- **Contextual Expansion:** When a node is identified, the system retrieves its ancestors (up to 2 levels deep).
- **Pruning:** To save tokens, only 4-5 summaries are sent per "turn".
- **Negative Feedback Loop:** The system will maintain a history of "visited and discarded" nodes during a session to prevent the LLM from looping over irrelevant data.

## 3. Cluster Detection & Synthesis (In Progress)
- **Trigger:** Clusters are formed based on **Session Density** (nodes created in the same session) + **Evolution** (shared lineage) + **Semantic Similarity** (high cosine similarity of summaries).
- **Synthesis:** When a cluster reaches a critical mass, a "Cluster Summary" is auto-generated to provide a high-level overview.
- **Hierarchy:** (Pending) Planned for nested clusters to prevent "data dumps" as the graph grows.