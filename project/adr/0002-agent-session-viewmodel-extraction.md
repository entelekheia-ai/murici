<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

# ADR-0002: Agent Session State Extracted into a Dedicated ViewModel (`AgentSessionProvider`)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-03 |
| Deciders | Danilo Borges |
| Supersedes | — |
| Superseded by | — |

---

## Context

Ao investigar por que "Novo Chat" herdava o assistant e o agente `.agent` da conversa anterior, mapeamos toda a arquitetura de gerenciamento de chat (`use-chat-handler.tsx`, `right-sidebar.tsx`, `global-state.tsx`, `context.tsx`) e confirmamos que não havia MVC/MVVM real:

- O **Model** (IndexedDB via `db/chats.ts` + `lib/local-db/*`) é limpo e single-purpose.
- O **ViewModel** da sessão de agente (criar/resetar/migrar/avançar a FSM por chat) não existia como camada própria — vivia misturado com a **View** dentro de `right-sidebar.tsx`: `useState` locais (`agentMeta`, `behaviorText`, `currentState`, `flowState`, `graphData`, `visitedOrder`...) ao lado de funções de negócio (`getOrCreateSession`, `applySessionToView`, `loadBehavior`, `loadAgentBundle`).
- Como esse estado só existia dentro de uma instância de componente (`RightSidebar`, que só monta quando `showRightSidebar === true`), qualquer outro hook que precisasse disparar uma ação nele (`use-chat-handler.tsx`) só conseguia via indireção de `useRef` (`loadAgentBundleRef.current(...)`, `goToNewChatWithPayloadRef.current(...)`) — um substituto improvisado para a ausência de uma API real.

Esse desenho concreto causou dois bugs:

1. **`handleNewChat()`** (`use-chat-handler.tsx`) resetava `chatMessages`/`chatFiles`/`selectedChat` e chamava `destroyChatAgentSession("__new__")`, mas nunca chamava `setSelectedAssistant(null)` — todo chat novo herdava o `assistant_id` da conversa anterior (`handleCreateChat(..., selectedAssistant!, ...)` gravava o valor antigo).
2. O reset do painel do agente dependia de um `useEffect([selectedChat?.id])` em `right-sidebar.tsx`. Clicar "Novo" já estando no bucket não salvo `"__new__"` não muda `selectedChat?.id` (`undefined → undefined`), então o efeito não disparava e o painel ficava com o agente antigo — o mesmo problema já tinha sido corrigido ad hoc só dentro de `goToNewChatWithPayload`, nunca em `handleNewChat`.

Ver o log de investigação completo em [`0002-agent-session-viewmodel-extraction-log.md`](0002-agent-session-viewmodel-extraction-log.md) (diagrama mermaid da arquitetura anterior, sequência exata do bug, erros de console das sessões anteriores).

## Decision

Extraímos o estado e a lógica de sessão do agente para um ViewModel próprio, com um único dono, montado uma vez perto da raiz do app:

- `context/agent-session-context.tsx` — `AgentSessionContext` + tipo `AgentSessionContextType`.
- `components/utility/agent-session-provider.tsx` — `AgentSessionProvider`, dono de todo o estado (`engine`, `currentState`, `graphData`, `visitedOrder`, `parseError`, `behaviorText`, `descriptionText`, `agentMeta`, `agentLoading`, `behaviors`) e das ações (`loadAgentBundle`, `handleAgentFile`, `resetSession`, `hasActiveAgent`, `queueNewChatPayload`).
- `lib/hooks/use-agent-session.ts` — `useAgentSession()`, acessor fino (`useContext`), sem estado/efeitos próprios — pode ser chamado de qualquer hook ou componente e todos leem/escrevem o mesmo estado.
- Montado em `app/[locale]/layout.tsx`, aninhado dentro de `<GlobalState>`, envolvendo `{children}` — sobrevive à montagem/desmontagem condicional do `RightSidebar`.

`right-sidebar.tsx` passou a consumir `useAgentSession()` em vez de manter o estado localmente; só restou o que é genuinamente View (diálogo "nesta conversa vs. nova conversa", JSX, wiring de drag&drop / OS "abrir com"). `use-chat-handler.tsx`'s `handleNewChat()` agora chama `resetSession("__new__")` (do hook compartilhado) e `setSelectedAssistant(null)`, corrigindo os dois bugs na mesma função que os causava.

## Options considered

- **Option A — Patch via `useRef` compartilhado (`resetAgentSessionRef` exposto no `ChatbotUIContext`)** — reaproveita o padrão de refs já existente no código; resolve os dois bugs reportados com menor diff. Rejeitado a pedido do usuário: mantém View e ViewModel misturados em `right-sidebar.tsx`, perpetuando a causa estrutural do "parece bugado por desordem".

- **Option B — Migração completa para Zustand ([Plan 001](../plans/001-zustand-state-migration.md))** — resolveria o problema de raiz para *todo* o estado de FSM (`flowEngine`, `flowEvents`, `flowState`, `thinkingLog`), não só a sessão de agente, e desacoplaria de vez o kernel do React. Correta como direção de longo prazo, mas escopo e risco muito maiores do que o necessário para o bug reportado agora; falta decidir as *Open Questions* do próprio plano (migrar só FSM ou também `chatMessages`).

- **Option C (chosen) — Context/Provider dedicado só para a sessão do agente** — extrai exatamente o estado que já estava preso em `right-sidebar.tsx` para um Provider de vida mais longa, sem introduzir uma nova biblioteca nem tocar no restante do `ChatbotUIContext`. Resolve os dois bugs, remove a causa estrutural (indireção via ref) e não fecha a porta para a Option B depois — pelo contrário, isola exatamente a fatia de estado que o Plan 001 já pretendia mover, tornando essa migração futura mais contida.

## Consequences

**Fica mais fácil:**
- Existe um único ponto de verdade para "criar/resetar/migrar sessão de agente" (`resetSession`), chamável de qualquer hook — a próxima feature que precisar disparar isso não vai precisar reinventar outra indireção via ref.
- O estado do painel sobrevive a `showRightSidebar` alternando entre `true`/`false` (antes, cada desmontagem do `RightSidebar` destruía e reconstruía o estado local, reconciliado só de forma indireta via `chatAgentSessionsRef`).
- `right-sidebar.tsx` fica menor e mais próximo de ser só View.

**Fica mais difícil / custos aceitos:**
- Mais um Provider na árvore (`AgentSessionProvider` ao lado de `GlobalState`) — ainda não é a consolidação via Zustand do Plan 001, só um passo nessa direção para uma fatia do estado.
- `goToNewChatWithPayload` continua parcialmente em `right-sidebar.tsx` porque depende de `useChatHandler()` (para `handleNewChat`), então a extração não é 100% completa — é uma orquestração fina entre dois hooks, não uma centralização total.
- O `ChatbotUIContext` monolítico (`context.tsx` + `global-state.tsx`) continua misturando UI state, chat state e o restante do kernel state — o comentário `// TODO: Separate into multiple contexts` em `global-state.tsx` segue válido para tudo que não é sessão de agente.

**Follow-up:**
- Revisão de arquitetura futura planejada pelo usuário para centralizar mais os componentes (candidatos diretos: [Plan 001](../plans/001-zustand-state-migration.md) — Zustand; [Plan 004](../plans/004-chat-handler-strategy.md) — Strategy Pattern para `use-chat-handler.tsx`). Este ADR não substitui esses planos; reduz o escopo do que falta migrar.
- Teste manual do usuário no navegador ainda pendente no momento deste ADR (ver log).

## Related

- [Log de investigação (long-form)](0002-agent-session-viewmodel-extraction-log.md)
- [Plan 001 — Zustand State Migration](../plans/001-zustand-state-migration.md)
- [Plan 004 — Chat Handler Strategy Pattern](../plans/004-chat-handler-strategy.md)
- `context/agent-session-context.tsx`, `components/utility/agent-session-provider.tsx`, `lib/hooks/use-agent-session.ts`
- `components/sidebar/right-sidebar.tsx`, `components/chat/chat-hooks/use-chat-handler.tsx`, `app/[locale]/layout.tsx`
