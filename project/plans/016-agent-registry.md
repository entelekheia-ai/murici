<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

# Plan-016: Registered `.agent` Bundles at Runtime

| Field | Value |
|---|---|
| Status | Backlog |
| Created | 2026-07-15 |
| Author | Danilo Borges |

> **Note:** This plan was drafted from context gathered during a dot-agent-cli session, without
> dedicated exploration of the murici repo. It needs its own exploration session before it can be
> treated as an executable plan.

---

## Summary

Implement a persistent registry for user-installed and third-party `.agent` bundles that survive application restarts and can be updated or removed. This enables external tools like dot-agent-cli to install and maintain agents at runtime without requiring an application rebuild.

## Goals

- Introduce a third category of agents: registered (installed at runtime, persisted across restarts).
- Provide system agents and runtime registration as distinct loading paths.
- Mirror the existing MCP config store pattern for consistency.
- Enable dot-agent-cli to install its helper agent persistently in Murici.

## Scope

### In Scope

- Design and implement a persistent manifest system for registered agents (analogous to `lib/mcp/config-store.ts`).
- API routes for listing, registering, and unregistering agents.
- Settings UI to display and manage registered agents.
- Decide how registered agents load and integrate with existing system agents.

### Out of Scope

- MCP server registration (already exists and works: `lib/mcp/*`).
- Changes to how built-in system agents (`onboarding-agent`, `background-agent`) are currently built or loaded.
- Resolving Open Question #5 (who triggers registration) — this plan only documents that the question exists.

---

## Design

### Current State

Murici today has two ways `.agent` bundles reach runtime:

1. **System agents (build-time)** — Compiled by `scripts/build-agents.js` into `public/agents/<name>.agent`, loaded by `lib/agents/system-agents.ts`. Fixed in the app bundle, not updatable at runtime.

2. **Drag-and-drop (runtime, transient)** — Loaded by `app/api/agent/unpack/route.ts` for a single chat session, not persisted or managed.

Missing: A third concept of a registered agent — installed and persisted outside the build, survives restarts, can be updated or removed.

### Structural Precedent: MCP Config

Murici already solved a similar problem for MCP servers. The pattern to mirror:

- `lib/mcp/config-store.ts` — Simple JSON manifest in `~/.config/murici/mcp.json` (read/write to disk, no cache).
- `app/api/mcp/config/route.ts` — HTTP API routes for `GET`/`POST` on the manifest.
- `components/utility/mcp-settings.tsx` — Settings tab to list and manage servers.

A registered agents system likely mirrors the same shape: persistent manifest + API routes (`list`/`register`/`unregister`) + settings UI — but with different content and storage decisions (path reference vs. copying bytes into Murici's config directory).

---

## Success Criteria

*Not yet defined — this plan needs a dedicated exploration session on the murici repo before
success criteria can be set (see status note above).*

---

## Tracks

*Not yet broken into tracks — pending the dedicated exploration session referenced above.*

---

## Dependencies

*None identified yet.* Note: Open Question #5 (who triggers registration) is intentionally **not**
resolved by this plan — it only documents that the question exists (see Open Questions and Out of
Scope).

---

## Open Questions

1. **Storage** — Should the manifest point to an external path (e.g., where dot-agent-cli installs globally) or should Murici copy the `.agent` bytes into `~/.config/murici/agents/<name>.agent`? Path reference is simpler and always reflects the latest version; copying is more resilient (survives if the origin disappears).

2. **Versioning & Replacement** — Every `.agent` bundle carries a version in `aboutme.json`. Should a reinstall automatically replace an existing agent, require user approval, or never silently overwrite?

3. **System vs. Registered Distinction** — Should registered agents appear in the same list as built-in system agents in the UI, or be visually/architecturally separated?

4. **Who Triggers Installation** — If dot-agent-cli wants to auto-install the helper agent, should it call the Murici API directly (requires Murici to be running locally) or should Murici pull from a well-known location on startup (more resilient)?

5. **Initial Creation** — Should the registry manifest be created on first app launch, or only when the first agent is registered?

---

## Related

- MCP config store pattern in `lib/mcp/config-store.ts`
- Existing agent unpack logic in `app/api/agent/unpack/route.ts`
- System agents loading in `lib/agents/system-agents.ts`
