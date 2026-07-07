<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

# RFC-0005: Background Model Configuration

| Field | Value |
|---|---|
| Status | Implemented |
| Created | 2026-06-19 |
| Author | Danilo Borges |
| Depends on | [RFC-0001](./0001-local-model-autodiscovery.md) — Local Model Autodiscovery |
| Related | [RFC-0004](./0004-knowledge-graph-enrichment-and-traversal.md) — Knowledge Enrichment |

---

## Summary

Allow users to designate a specific local model for automatic background tasks (knowledge enrichment, artifact naming/summarization), independent of the model active in the current chat. The setting lives in the profile panel and falls back gracefully to the active chat model when unset.

---

## Motivation

Background tasks such as knowledge enrichment (`triggerEnrichment`) run automatically after every assistant message and on manual "✦ nomear" actions. These tasks call the currently active chat model — which may be a large, slow, or expensive model chosen for the conversation itself. Routing background tasks through the same model creates unnecessary load and latency.

Users running local inference should be able to use a lightweight model (e.g. `phi3:mini`, `llama3.2:3b`) for background work while keeping a larger model in the chat.

---

## Scope

**In scope:**
- Profile setting `background_model_id` stored in IndexedDB alongside other profile keys
- Select component in the Profile settings panel listing all autodiscovered local models
- Context state `backgroundModel: LLM | null` resolved once after each discovery run
- Fallback to chat model when `background_model_id` is null or unset
- Detection of missing model post-discovery: open profile panel with a warning banner
- Both automatic enrichment (`triggerEnrichment`) and manual enrichment (`enrichKnowledgeRecord` via "✦ nomear") use the background model

**Out of scope:**
- Cloud model support for background tasks (only local models in Phase 1)
- Auto-selection of the "smallest available" model (user configures explicitly)
- Background model for future pipeline tasks (summarizer, graph clustering — to be addressed in RFC-0004 phase)

---

## Decisions

### Storage: IndexedDB profile key (no schema migration)

The profile is stored in IndexedDB via `getSetting`/`setSetting` in `db/profile.ts`. Adding `"background_model_id"` to `PROFILE_KEYS` is sufficient — no SQL migration, no Supabase change. The `Profile` interface in `types/database.ts` was extended with `background_model_id: string | null`.

### Model pool: local only

The select is populated exclusively from `availableLocalModels` (autodiscovered via RFC-0001). Cloud models are excluded in Phase 1 because the enrichment pipeline calls the model directly via `baseUrl/v1/chat/completions`, bypassing the cloud routing layer (`handleHostedChat`). Extending to cloud models would require routing background calls through the existing hosted chat infrastructure — deferred to a future RFC.

### Resolution: context state post-discovery

`background_model_id` (a string ID) is resolved to a full `LLM` object (`backgroundModel: LLM | null`) in `global-state.tsx` immediately after each `fetchLocalModels()` call. All consumers read `backgroundModel` from context rather than performing their own lookup — single point of resolution.

### Validation trigger: every discovery run

The "model not found" check runs every time discovery completes — at startup and each time the model selector dropdown opens (per RFC-0001 trigger policy). If the saved model is absent from the result, `backgroundModelMissing` is set to `true` and `murici:profile-open` is dispatched, opening the profile panel automatically.

This is intentionally slightly invasive: if the user pauses Ollama mid-session and opens the model selector, the profile panel opens. The rationale is that a misconfigured background model silently degrades enrichment quality, so surfacing the issue promptly is preferable. UX can be refined in a follow-up.

### Fallback: active chat model

When `background_model_id` is null (never configured or explicitly cleared), consumers fall back to `modelData` — the active chat model. This preserves the behavior that existed before this RFC, so users who never configure the setting experience no change.

### Consumer pattern

Both enrichment call sites apply the same override:

```ts
// was: enrichmentFn(records, modelData, ...)
// now:
enrichmentFn(records, backgroundModel ?? modelData, ...)
```

`handleCreateMessages` in `chat-helpers/index.ts` received a new optional `backgroundModel?: LLM | null` parameter threaded from `useChatHandler`. `KnowledgeRightPanel` reads `backgroundModel` directly from context and passes `backgroundModel ?? modelData` to `KnowledgeChip`.

---

## Files Changed

| File | Change |
|---|---|
| `types/database.ts` | Add `background_model_id: string \| null` to `Profile` |
| `db/profile.ts` | Add key to `PROFILE_KEYS` and `defaultProfile()` |
| `context/context.tsx` | Add `backgroundModel`, `setBackgroundModel`, `backgroundModelMissing`, `setBackgroundModelMissing` |
| `components/utility/global-state.tsx` | State vars + post-discovery validation block |
| `components/utility/profile-settings.tsx` | `murici:profile-open` listener, missing model banner, `Select` component |
| `components/knowledge/knowledge-right-panel.tsx` | Pass `backgroundModel ?? modelData` to `KnowledgeChip` |
| `components/chat/chat-helpers/index.ts` | Add `backgroundModel?` param to `handleCreateMessages`, thread to `triggerEnrichment` |
| `components/chat/chat-hooks/use-chat-handler.tsx` | Read `backgroundModel` from context, pass to `handleCreateMessages` |

---

## Open Questions

- **Discovery refresh mid-session:** If the user opens the model selector and the background model has gone missing, the profile panel opens automatically. This is abrupt — a toast with a "Configure" action might be gentler. Deferred to UX review.
- **Cloud background model (Phase 2):** Routing enrichment through `handleHostedChat` would require significant refactor. The benefit is allowing `gpt-4o-mini` or `claude-haiku` as a cheap background model for users who prefer cloud. Worth revisiting when enrichment volume grows.
- **Background model per workspace:** Currently a global profile setting. Per-workspace configuration could be useful if users run different workflows in different workspaces. Out of scope for now.
