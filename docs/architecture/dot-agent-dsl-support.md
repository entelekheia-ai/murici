# dot-agent DSL Support

> Murici is the public proof-of-concept for the `.agent` language. This document states which slice of the DSL Murici exposes today and why. The canonical, full roadmap lives in the spec repo: [`dot-agent/ROADMAP.md`](../../../dot-agent-spec/ROADMAP.md).

---

## What the POC exposes: DSL v0.1 — Conversational

Murici runs the **conversational tier** of the DSL: a structured finite-state dialogue. An agent moves between `state`s, sets `goal`/`guide`/`teach` context for the LLM, waits on `interact`, and routes on `on intent` / `on offtopic` / `transition`. Multi-file behavior composition via `merge` is in this tier.

This is deliberately the smallest honest surface — no side effects, no typed I/O, no access control yet. It is enough to demonstrate deterministic, inspectable agent behavior end-to-end.

## What is deferred, and why

The `.description` blocks for typed I/O (`capabilities`, `input`, `output`, `require`, `type`) exist in the grammar but do nothing at runtime today, so the POC does not present them as supported. They activate together in **DSL v0.2 — Typed & Executable**, where `run` (tools, subagents, scripts) becomes meaningful — because `run` depends on the access model (`require` granted, `capabilities` declared), which depends on the type system.

## Where this couples to Murici's memory architecture

Two DSL milestones directly unlock features in [MAG](./mag-architecture.md):

| DSL milestone | Unlocks in Murici |
|---|---|
| Kernel protocol v2 (memory ownership, checkpoint/restore) — *v0.2* | `remember()` traversal, WASM evict/resume between turns |
| Data contract (`complete … with Type`) — *v0.2* | Typed artifact nodes + `authored_by` / `derived_from` edges |

Until those land, MAG runs on `generated_in` edges and free-form `knowledge` nodes only (see the MAG roadmap table).

## Versioning note

The **DSL version** (`v0.1`) and Murici's **package version** are independent. At the first public release the dot-agent package tens digit mirrors the DSL milestone (`0.10.x` = DSL v0.1); see the spec ROADMAP's "Two version axes" section.
