<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0
-->

# Knowledge Extraction Pipeline — Developer Guide

> How fenced code blocks become persistent knowledge nodes. Read this before touching the extraction or enrichment code.

---

## Overview

Every time the assistant sends a message containing a fenced code block (` ```lang...``` `), the Murici runtime automatically:

1. Extracts each block into a `KnowledgeRecord`
2. Saves it to the `knowledge` IndexedDB store
3. Updates React Context so the UI reflects the new node
4. Fires a background LLM call to generate `summary` (and override placeholder title if needed)

This pipeline is defined in RFC-0002. The architecture is in [docs/architecture/mag-architecture.md](../architecture/mag-architecture.md).

---

## File Map

### Data layer (RFC-0002)

```
types/knowledge.ts                    ← KnowledgeRecord, GeneralContent, AgentRunRef
lib/local-db/schema.ts               ← IndexedDB schema (version 2, store: "knowledge")
lib/local-db/knowledge.ts            ← CRUD: create, update, getByConversation, getAll
lib/knowledge/extract.ts             ← Regex extraction + title derivation
lib/knowledge/enrich.ts              ← Background LLM enrichment (local models only in v0)
context/context.tsx                  ← knowledge[] + setKnowledge in ChatbotUIContext
components/utility/global-state.tsx  ← useState + Provider value
components/chat/chat-helpers/index.ts ← Trigger point: end of handleCreateMessages
components/chat/chat-hooks/use-chat-handler.tsx ← Passes setKnowledge through
components/chat/chat-ui.tsx          ← Loads knowledge from DB on conversation open
```

### UI layer (RFC-0003)

```
components/knowledge/knowledge-chip.tsx          ← Chip reutilizável (título editável, copy, "✦ nomear")
components/knowledge/knowledge-right-panel.tsx   ← Painel direito do chat (?knowledge=true)
components/knowledge/knowledge-sidebar-section.tsx ← Seção colapsável na sidebar
components/knowledge/knowledge-graph-page.tsx    ← Container da rota /graph (tabs Grafo/Lista)
components/knowledge/knowledge-graph-canvas.tsx  ← React Flow canvas + layout dagre
components/knowledge/knowledge-list-view.tsx     ← Tabela buscável/ordenável
app/[locale]/[workspaceid]/graph/page.tsx        ← Rota Next.js
components/ui/dashboard.tsx                      ← KnowledgeRightPanel + auto-open listener
components/sidebar/sidebar-switcher.tsx          ← Botão IconBrain + badge
components/sidebar/sidebar.tsx                   ← KnowledgeSidebarSection no tab "chats"
```

---

## Extraction (`lib/knowledge/extract.ts`)

Runs synchronously after the assistant message is saved. Pure function — no DB access, no side effects.

### Regex

```ts
const FENCE_RE = /```(\w*)\n([\s\S]*?)```/g
```

Captures: `language` (optional word chars after opening ` ``` `) and `content` (everything between fences). Requires a `\n` immediately after the language tag — most LLM outputs follow this format.

**Minimum threshold:** 3 non-empty lines. Prevents saving trivial one-liners.

### Title derivation

| Language tag | Rule |
|---|---|
| `md`, `markdown` | First `#` heading, or first non-empty line |
| `html` | `<title>` content, or `<h1>` text |
| Anything else | `"{language} · HH:mm"` — a placeholder that LLM will replace |
| Empty tag | `"text · HH:mm"` — same placeholder behavior |

Placeholder titles match `PLACEHOLDER_TITLE_RE = /^.+ · \d{2}:\d{2}$/` in `enrich.ts`.

---

## Trigger point (`chat-helpers/index.ts`)

Inside `handleCreateMessages`, after `setChatMessages(finalChatMessages)`:

```ts
// Extraction is isolated in try/catch — never breaks normal message saving
try {
  const records = buildKnowledgeRecords(assistantMessage, chatId, userMessageId)
  if (records.length > 0) {
    for (const record of records) await createKnowledgeRecord(record)
    setKnowledge(prev => [...prev, ...records])
    triggerEnrichment(records, modelData, setKnowledge)
  }
} catch (err) {
  console.error("[knowledge] extraction/save failed:", err)
}
```

**Important:** extraction only runs in the non-regeneration path (`else` branch). Regeneration updates existing messages; it does not create new knowledge nodes.

---

## Enrichment (`lib/knowledge/enrich.ts`)

Runs fire-and-forget after extraction. Updates `summary` (always) and `title` (only for placeholder titles).

### Local model detection

```ts
function isLocalModel(modelData: LLM): boolean {
  return modelData.provider === "local" || !!modelData.baseUrl
}
```

- `provider === "local"`: models auto-discovered via RFC-0001 (`/api/models/discover`)
- `!!modelData.baseUrl`: manually configured custom models with explicit base URL

Cloud models (no `baseUrl`, `provider !== "local"`) are NOT auto-enriched in v0. RFC-0003 will add a `"✦ nomear"` button for on-demand enrichment.

### Base URL resolution

```ts
modelData.baseUrl ?? process.env.NEXT_PUBLIC_OLLAMA_URL ?? "http://localhost:11434"
```

Mirrors the same fallback logic used by `handleLocalChat` in `chat-helpers/index.ts`.

### LLM call

A single non-streaming `POST` to `${baseUrl}/v1/chat/completions` with `temperature: 0.3`. The prompt asks for JSON `{ "title": "...", "summary": "..." }`. Response parsing extracts the first JSON object found (handles models that wrap JSON in prose).

### Title override rule

- Title is **replaced** only when it's a placeholder (`/^.+ · \d{2}:\d{2}$/`)
- Title is **preserved** when it was derived deterministically (markdown heading, HTML title tag)
- `summary` is **always** set from LLM result, regardless of title source

---

## IndexedDB Schema (version 2)

Store name: `"knowledge"` | Key path: `"id"`

| Index | Field | Used for |
|---|---|---|
| `by_conversation` | `originConversationId` | Load nodes when opening a conversation |
| `by_created` | `createdAt` | Chronological sorting |
| `by_type` | `nodeType` | Filter by node type (roadmap) |

The `knowledge` store was added in DB version 2. Users upgrading from version 1 get the store automatically via the `upgrade` block in `lib/local-db/schema.ts`.

---

## Loading on conversation open (`chat-ui.tsx`)

```ts
const knowledgeNodes = await getKnowledgeByConversationId(chatId)
setKnowledge(knowledgeNodes)
```

Called inside `fetchMessages` (the same effect that loads chat messages when navigating to a conversation). Knowledge nodes for other conversations are not loaded — the context holds only the current conversation's nodes for now. The `/graph` route (RFC-0003) loads all nodes for the full graph view.

---

## UI surfaces (RFC-0003)

### Right panel (`?knowledge=true`)

The right panel opens automatically when the **first** knowledge node is extracted in a conversation. It dispatches `murici:knowledge-panel-open` via `window.dispatchEvent`; `dashboard.tsx` listens and sets the URL param.

The panel shows `KnowledgeChip` components for the current conversation's nodes (sorted newest-first). The chip supports:
- **Inline title edit**: click title → `<input>` → blur/Enter → `updateKnowledgeRecord`
- **Expand**: click chip body → shows first 5 non-empty lines of content
- **Copy**: copies `payload.content` to clipboard
- **"✦ nomear"**: shown when title is a placeholder AND active model is cloud → calls `enrichKnowledgeRecord` on demand

### Sidebar section

`KnowledgeSidebarSection` appears above the conversations list in the "chats" tab. Shows the 3 most recent nodes as compact chips. Collapsible. "Ver tudo →" navigates to `/graph`.

### `/graph` route

Two tabs:
- **Grafo**: React Flow canvas with dagre layout (`rankdir: LR`). Conversation nodes (rounded rect, muted) and knowledge nodes (pill, colored by language hash) connected by bezier edges. Click conversation → navigate to chat. Click knowledge → modal preview.
- **Lista**: sortable/searchable table. Truncation on the Conversa column, not the title.

Both views share the same modal component: `80vw` wide, markdown content rendered with `ReactMarkdown + remarkGfm`, code content in `<pre>`.

---

## What's NOT implemented yet (v1+)

- `agentRuns` population during agent sessions
- `derivedFrom` lineage edges
- Cloud model enrichment — "✦ nomear" button wired up, but auto-enrichment for cloud models deferred
- Cross-conversation node refinement and `KnowledgeEdge` store
- `remember()` LLM tool for graph traversal
- Semantic clustering and `memory_summarizer` pipeline

See [RFC-0004](../../_rfc/0004-knowledge-graph-enrichment-and-traversal.md) for the v1+ roadmap.
