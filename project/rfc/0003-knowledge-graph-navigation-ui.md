<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0
-->

# RFC-0003: Knowledge Graph — Navigation UI

| Field | Value |
|---|---|
| Status | Implemented |
| Created | 2026-06-19 |
| Implemented | 2026-06-19 |
| Author | Danilo Borges |
| Depends on | [RFC-0002](./0002-knowledge-graph-data-model.md) — Knowledge Graph Data Model |
| Required by | [RFC-0004](./0004-knowledge-graph-enrichment-and-traversal.md) — Enrichment & Traversal |

---

## Summary

Expose the knowledge graph built in RFC-0002 through two complementary UI surfaces: a contextual right panel inside the chat view (artifacts section + agent inspector), and a dedicated `/graph` route with both a graph canvas and list views. Knowledge nodes exist independently of conversations — they are first-class navigable objects.

---

## Motivation

No current AI runtime surfaces the outputs generated across conversations as a browsable, interconnected collection. The affordance today is "find the chat where that was generated." The goal is "navigate directly to the output."

This RFC implements the minimum UI that makes knowledge nodes visible and navigable, setting the foundation for the cognitive landscape described in RFC-0012.

---

## Scope

**In scope (v0):**
- Right panel in chat: two sections — Knowledge (artifacts from this conversation) + Agent Inspector (when agent is running)
- Right panel: "✦ name" button for cloud model title enrichment
- Dedicated `/graph` route accessible from the sidebar
- Graph canvas: React Flow, nodes for Conversations + Knowledge, edges "generated in"
- List view in `/graph`: all knowledge nodes across conversations, sortable/filterable
- Node click navigation: Conversation node → opens that chat; Knowledge node → opens right panel with that node focused

**Out of scope (v1+):**
- Semantic cluster grouping (Layer 2 of MAG abstraction)
- Territory/Ecosystem views (Layers 3–4)
- WebGL renderer (replaces React Flow when graph scale requires it)
- Agent nodes in the graph canvas
- Knowledge node detail page (full view outside of right panel)
- Shared/collaborative graph views

---

## Right Panel — Chat View

The right panel is contextual. It has two sections that stack vertically:

```
┌─────────────────────────────┐
│ Artefatos desta conversa    │  ← always visible when panel is open
│  [node chip]                │
│  [node chip] ✦ nomear       │
│                             │
├─────────────────────────────┤
│ Agente                      │  ← visible only when agent session is active
│  Inspector do agente...     │
└─────────────────────────────┘
```

- Knowledge section appears first, regardless of agent state
- Agent inspector section appears below it only when an `AgentSession` is active
- Panel can be collapsed/hidden (existing toggle)
- When panel is closed and a new knowledge node is extracted, a badge counter appears on the panel toggle button

### Knowledge Node Chip

Each extracted node renders as a compact chip:

```
┌──────────────────────────────────────────┐
│ 🔷  Relatório lucro Honda Civic          │
│     typescript · 10:42          [copy]   │
└──────────────────────────────────────────┘
```

- Icon reflects `nodeType` (v0: all are `knowledge` → consistent icon)
- `language` and timestamp shown as secondary info
- Click → expands inline to show content preview (first 5 lines)
- "✦ nomear" button appears instead of title when title is still a placeholder AND the active model is cloud

### Title editing

Click on title text → inline edit input → blur or Enter saves to IndexedDB + updates Context.

---

## `/graph` Route

Accessible from the sidebar as a top-level navigation item (alongside conversations list).

The route has two views toggled by a tab or segmented control:

```
[ Grafo ]  [ Lista ]
```

### Graph view

Built with **React Flow** (`@xyflow/react`).

**Node types (v0):**

| Type | Visual | Data source |
|---|---|---|
| `conversation` | Rounded rect, muted color, title of conversation | `ConversationRecord` |
| `knowledge` | Circle or pill, colored by `language`, title | `KnowledgeRecord` |

**Edge types (v0):**

| Type | Label | Meaning |
|---|---|---|
| `generated_in` | — | Knowledge node → origin conversation |

**Interactions:**
- Click Conversation node → navigate to that chat
- Click Knowledge node → open right panel of that chat with the node focused (or a modal preview if chat is not open)
- Zoom + pan (React Flow default)
- No drag-to-rearrange in v0 — layout is automatic (React Flow dagre or force layout)

**Layout:** dagre (top-down or left-right). Force-directed is better for large graphs but requires D3; dagre ships with React Flow ecosystem. Switch to force/WebGL when node count warrants it (v1+).

**Note on future renderer:** React Flow is the v0 choice. The data model (nodes + edges as typed arrays) is the stable interface. When WebGL becomes necessary for scale, the renderer is swapped without changing the data layer. No abstraction wrapper is added now — the swap is a contained component replacement.

### List view

A flat, searchable table of all knowledge nodes across all conversations.

Columns: title, language, nodeType, originConversationId (linked), createdAt.

Sortable by createdAt (default desc), title, language.

Searchable by title + summary text (client-side filter in v0; full-text index in v1+).

Click row → same navigation behavior as graph node click.

---

## Sidebar Integration

The sidebar gains a new section above (or alongside) the conversations list:

```
+ Novo chat

▸ Conhecimento     ← new section, links to /graph
  [recent node chip x3]
  Ver tudo →

  Conversas
  [existing list...]
```

The "Conhecimento" section shows the 3 most recently created knowledge nodes as compact chips. "Ver tudo" navigates to `/graph`.

This makes knowledge nodes immediately visible without requiring the user to open the graph view, and positions them as first-class objects outside of conversations.

---

## Reactivity

Knowledge nodes appear in the right panel and sidebar in real time as they are extracted (RFC-0002 updates React Context `knowledge[]`). No page refresh required.

When background enrichment (title/summary) completes, the chip updates in place via Context update.

---

## Open Questions

1. **Right panel default state:** should the panel be open by default when a new chat is started, or only open on first artifact extraction? *Tentative: closed by default, auto-opens on first artifact.*

2. **Graph initial layout:** dagre layout can produce crowded graphs with many nodes. Should there be a minimum zoom level or a "fit view" button? *React Flow provides `fitView` — included by default. ✅ Resolved.*

3. **Knowledge node modal vs. navigation:** clicking a Knowledge node in the graph when the originating chat is not open — open a modal preview, or navigate to the chat? *Modal preview implemented in v0. ✅ Resolved.*

4. **Sidebar section placement:** above conversations or as a tab? Tabs require restructuring the sidebar; a section above is additive. *Section above conversations, collapsible. ✅ Resolved.*

---

## Implementation Notes

### Files created

| File | Role |
|---|---|
| `components/knowledge/knowledge-chip.tsx` | Chip reutilizável: título inline-editável, expansão, copy, botão "✦ nomear" para modelos cloud |
| `components/knowledge/knowledge-right-panel.tsx` | Painel direito do chat (`?knowledge=true`), lista chips da conversa atual |
| `components/knowledge/knowledge-sidebar-section.tsx` | Seção colapsável na sidebar: últimos 3 nós + "Ver tudo →" |
| `components/knowledge/knowledge-graph-page.tsx` | Container da rota `/graph` com tabs Grafo / Lista |
| `components/knowledge/knowledge-graph-canvas.tsx` | Canvas React Flow + layout dagre + modal de preview |
| `components/knowledge/knowledge-list-view.tsx` | Tabela buscável/ordenável de todos os nós |
| `app/[locale]/[workspaceid]/graph/page.tsx` | Rota Next.js para o grafo |

### Files modified

| File | Change |
|---|---|
| `components/ui/dashboard.tsx` | Adiciona `KnowledgeRightPanel` dinâmico + listener `murici:knowledge-panel-open` |
| `components/sidebar/sidebar-switcher.tsx` | Botão `IconBrain` com badge de contagem |
| `components/sidebar/sidebar.tsx` | `KnowledgeSidebarSection` acima da lista de chats |
| `components/chat/chat-helpers/index.ts` | Dispara `murici:knowledge-panel-open` na primeira extração da conversa |

### Key decisions

- **Auto-open panel**: o painel abre automaticamente na primeira extração via evento customizado `murici:knowledge-panel-open`, consistente com `murici:sidebar-navigate`.
- **Modal content rendering**: markdown (`md`/`markdown`) renderizado com `ReactMarkdown` + `remarkGfm`; outros formatos em `<pre>` monoespaço.
- **Edge type**: `default` (bezier) do React Flow, mais suave que `smoothstep` (ortogonal).
- **Modal size**: `80vw` com `max-w-[1200px]` — ocupa a área visível sem overflow.
- **Dependencies added**: `@xyflow/react`, `@dagrejs/dagre`.
