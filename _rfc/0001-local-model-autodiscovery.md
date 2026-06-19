<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

# RFC-0001: Local Model Autodiscovery — Phase 1

| Field | Value |
|---|---|
| Status | Implemented |
| Created | 2026-06-19 |
| Author | Danilo Borges |
| Background | [local-model-autodiscovery.md](./local-model-autodiscovery.md) |

---

## Summary

Implement automatic detection of running local inference servers (Ollama, LM Studio, oMLX, and any OpenAI-compatible engine) so that their models appear in the Murici model selector without any manual configuration. Phase 1 covers discovery only — port polling, oMLX config file scanning, and UI integration. Orchestration (auto-starting engines) and memory management (model unloading) are out of scope.

---

## Motivation

The background RFC documents the full landscape. Phase 1 targets the highest-value, lowest-complexity slice: users who already have a local engine running should see its models automatically, with zero configuration.

---

## Scope

**In scope (Phase 1):**
- Active port polling for known default ports
- Passive config file scanning for oMLX (`~/.omlx/settings.json`)
- Type system changes to support dynamic model IDs and the new `"local"` provider
- UI integration: loading indicator in the model selector, trigger on startup and on dropdown open
- Removal of the legacy `fetchOllamaModels` function (superseded by discovery)

**Out of scope (future phases):**
- Binary detection and engine auto-start via `child_process`
- Model unloading / sleep mode for idle engines
- VRAM / hardware metrics
- Model downloader UI

---

## Decisions

### Architecture: Next.js API Route

Discovery runs server-side in a new route `app/api/models/discover/route.ts`. This avoids browser CORS restrictions from local inference servers that do not configure permissive CORS headers, and allows access to the local filesystem for config file scanning. The Electron IPC bridge is not used in this phase; that pattern is reserved for Phase 2 where `child_process` is needed to spawn engines.

### Type System: Option A (widened `LLMID`, new `"local"` provider)

Three options were evaluated:

| Option | Description |
|---|---|
| **A (chosen)** | Widen `modelId` to `LLMID \| string`; add `"local"` to `ModelProvider`; remove `"ollama"` |
| B | Single `"local"` provider with an optional `engine` field on `LLM` |
| C | New `DiscoveredLLM` type extending `LLM`; separate context state |

**Option A is the MVP choice.** The `as LLMID` cast in the existing `fetchOllamaModels` is already a type lie — widening the type makes this honest. The model selector already groups by `provider`, so a single `"local"` group appears without new grouping logic. Option B adds a field that requires reading logic downstream. Option C duplicates context state without benefit for Phase 1.

**Concrete changes:**
- `types/llms.ts`: `modelId: LLMID | string`
- `types/models.ts`: add `"local"` to `ModelProvider`, remove `"ollama"`

### Port Conflict Resolution: Generic `"local"` Provider

LocalAI and Llama.cpp both listen on port `8080` with identical `/v1/models` response shapes. vLLM and oMLX both default to port `8000`. There is no reliable in-band signal to distinguish them.

Rather than heuristics, all OpenAI-compatible endpoints are registered as `provider: "local"`. The model name, which comes from the `id` field in the `/v1/models` response, is what the user sees and cares about. Which application is serving the model is irrelevant to the chat experience.

Ollama is included in this same `"local"` bucket despite using a different endpoint format (`/api/tags`). The `"ollama"` provider value is removed from the codebase.

### Discovery Trigger: Startup + Dropdown Open

Discovery runs:
1. **On app startup** — alongside `fetchHostedModels` and `fetchOpenRouterModels` in `global-state.tsx`
2. **Each time the model selector dropdown opens** — via the `onOpenChange` handler in `model-select.tsx`

This eliminates the need for a dedicated "Refresh" button. The natural moment a user wants fresh model data is when they open the selector to switch models. Background polling is not used — it produces unnecessary network noise and the discovery returns near-instantly for closed ports (ECONNREFUSED is immediate).

**Process detection before polling was evaluated and rejected.** Listing running processes cross-platform requires either shell parsing (`ps aux` / `tasklist`) or a native module, with significant maintenance overhead. The benefit is negligible because `ECONNREFUSED` on a closed port returns in milliseconds — the timeout cost only applies to open ports with slow responses, which is rare on localhost.

### Timeout: 500ms per Probe

Each probe uses an `AbortController` with a 500ms timeout. All probes run in parallel via `Promise.allSettled`, so the total discovery time equals the slowest responding (or timing out) server. The value is exposed as a named constant `DISCOVERY_TIMEOUT_MS` for easy tuning.

### UX: Loading Indicator in Dropdown

While discovery is in flight, the model selector shows a disabled item ("Atualizando...") at the top of the local models section. When the discovery Promise resolves, the item is replaced by results (or disappears if nothing was found). This decouples perceived performance from actual network latency.

### Legacy `fetchOllamaModels`: Replaced

`fetchOllamaModels` is removed. The discovery route covers Ollama alongside all other engines. `NEXT_PUBLIC_OLLAMA_URL` is retained as an optional override for the Ollama probe URL (default: `http://localhost:11434`); if unset, the default is used. This preserves backwards compatibility for users running Ollama on a non-standard host without requiring any UI change.

### Persistence: Discovered Models Are Ephemeral

Autodiscovered models are **not** saved to the database. They live only in `availableLocalModels` in the React context and are rebuilt on each discovery run. The existing "Create Model" UI (sidebar → models) handles the persistent, manual registration case and is unchanged. There is no deduplication concern between the two: manual models carry `provider: "custom"` from the DB; discovered models carry `provider: "local"` from the discovery route.

---

## Probe Table

| Engine | URL | Endpoint | Format | Notes |
|---|---|---|---|---|
| Ollama | `NEXT_PUBLIC_OLLAMA_URL` or `http://localhost:11434` | `/api/tags` | Native | `models[].name` as model ID |
| LM Studio | `http://localhost:1234` | `/v1/models` | OpenAI | `data[].id` as model ID |
| LocalAI / Llama.cpp | `http://localhost:8080` | `/v1/models` | OpenAI | Both use same port; provider is `"local"` for either |
| vLLM / oMLX | from `~/.omlx/settings.json` or `http://localhost:8000` | `/v1/models` | OpenAI | oMLX requires `Authorization: Bearer <auth.api_key>` |
| Oobabooga | `http://localhost:5000` | `/v1/models` | OpenAI | |

---

## oMLX Config File Scanning

oMLX is the only engine with a plaintext config at a predictable path. Murici reads `~/.omlx/settings.json` on the server side before dispatching probes. The relevant fields are:

```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 8000
  },
  "auth": {
    "api_key": "local"
  }
}
```

If the file exists and is parseable, the `server.host`/`server.port` values override the default `localhost:8000` probe target, and `auth.api_key` is sent as `Authorization: Bearer <key>`. If the file is absent or malformed, the default probe is used without authentication.

---

## Implementation Steps

### Step 1: Update Type Definitions
- `types/llms.ts`: change `modelId: LLMID` → `modelId: LLMID | string`
- `types/models.ts`: add `"local"` to `ModelProvider`, remove `"ollama"`
- Fix any downstream type errors (model-icon, model-select tab filter)

### Step 2: Create Discovery Route
- New file: `app/api/models/discover/route.ts`
- Read `~/.omlx/settings.json` with `fs.readFile` (graceful fallback if absent)
- Build probe list from table above, substituting oMLX custom host/port if available
- Dispatch all probes in parallel with `Promise.allSettled` and `AbortController` (500ms)
- Normalize all responses to `LLM[]` with `provider: "local"` and `modelId: string`
- Return JSON array

### Step 3: Update `fetch-models.ts`
- Remove `fetchOllamaModels`
- Add `fetchLocalModels(): Promise<LLM[]>` that calls `GET /api/models/discover`

### Step 4: Update `global-state.tsx`
- Replace `fetchOllamaModels()` call with `fetchLocalModels()`
- Remove the `NEXT_PUBLIC_OLLAMA_URL` guard (discovery runs unconditionally)

### Step 5: Update `model-select.tsx`
- On `onOpenChange(true)`: call `fetchLocalModels()`, set local `isDiscovering` state
- While `isDiscovering`: render a disabled "Atualizando..." item in the local section
- On resolve: call `setAvailableLocalModels(results)`, clear `isDiscovering`
- Update tab filter from `provider === "ollama"` → `provider === "local"`

---

## Open Questions

- **oMLX `auth.api_key` in logs:** The key is read from disk and sent in an Authorization header. It never leaves localhost, but we should confirm it is not logged by the Next.js route in any log level.
- **Custom endpoints for other engines:** Users running LM Studio or vLLM on non-standard ports can use the existing "Create Model" flow. A dedicated settings field for additional discovery URLs is a Phase 2 consideration.
- **Ollama on remote host:** If `NEXT_PUBLIC_OLLAMA_URL` points to a remote machine (e.g., `http://192.168.1.100:11434`), the discovery probe will reach it. This is the desired behavior, but it means `fetchLocalModels` may include models from a remote host in the "local" group. Document this in the UI as "Local & Network Models" if it becomes confusing.
