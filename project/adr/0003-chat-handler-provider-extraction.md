<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

# ADR-0003: Chat useChat() State Extracted into a Dedicated ViewModel (`ChatHandlerProvider`)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-08 |
| Deciders | Danilo Borges |
| Supersedes | — |
| Superseded by | — |

---

## Context

Bug reportado ao vivo: "o modelo local recebe minha mensagem e gera, mas não chega na
interface." Investigação sistemática (logging por toda a call stack, a pedido explícito do
usuário) achou a causa raiz estrutural: `useChatHandler()`
(`components/chat/chat-hooks/use-chat-handler.tsx`) era chamado diretamente em **10
componentes diferentes** (`sidebar.tsx`, `delete-chat.tsx`, `right-sidebar.tsx`,
`chat-secondary-buttons.tsx`, `chat-ui.tsx`, `message.tsx`, `chat-messages.tsx`,
`chat-input.tsx`, `workspace-switcher.tsx`, `chat/page.tsx`), e cada chamada criava sua
**própria instância independente** de `useChat({id: sameId, onFinish, onError, ...})` do
Vercel AI SDK. O SDK sincroniza `messages`/`status` entre instâncias que compartilham `id`,
mas cada instância dispara seu próprio `onFinish`/`onError` para o mesmo evento de conclusão
— produzindo escritas duplicadas/corrompidas no banco (mensagem "user" vazia colidindo em
`sequence_number` com a real).

Esse é exatamente o mesmo padrão estrutural documentado em [ADR-0002](0002-agent-session-viewmodel-extraction.md):
um hook com estado e efeitos próprios sendo chamado de múltiplos pontos da árvore de
componentes, cada chamada criando sua própria instância isolada em vez de compartilhar uma
única fonte de verdade. Um lock por `useRef` não resolve (não é compartilhado entre
instâncias); um lock module-level também não resolve, porque a duplicação não vinha de
`handleSendMessage` ser chamado duas vezes — vinha de `onFinish` disparando uma vez por
instância montada.

Ver o log de investigação completo em
[`0003-chat-handler-provider-extraction-log.md`](0003-chat-handler-provider-extraction-log.md)
— inclui um **segundo bug, independente e mais grave**, achado só depois que a extração do
Provider já estava implementada e o teste E2E (`random-model-smoke.spec.ts`) continuava
falhando: um bug de desestruturação em `onFinish` que fazia toda resposta do modelo, mesmo
com uma única instância de `useChat()`, ser sobrescrita por uma linha vazia no instante em
que o streaming terminava. Esse segundo bug era a causa real e determinística do sintoma
original relatado pelo usuário; o bug de múltiplas instâncias causava corrupção adicional
(duplicação), mas não era a única razão da resposta nunca aparecer na tela.

## Decision

Replicamos o mesmo padrão do ADR-0002: extraímos a única chamada a `useChat()` e toda a
lógica de envio/streaming/persistência para um ViewModel próprio, com um único dono, montado
uma vez perto da raiz do app:

- `context/chat-handler-context.tsx` — `ChatHandlerContext` + tipo `ChatHandlerContextType`
  (mesma forma que `useChatHandler()` já retornava: `handleNewChat`, `handleSendMessage`,
  `handleFocusChatInput`, `handleStopMessage`, `handleSendEdit`, `chatInputRef`), com um
  objeto default 100% no-op.
- `components/utility/chat-handler-provider.tsx` — `ChatHandlerProvider`, dono da única
  chamada a `useChat(...)` e de todos os efeitos (streaming-sync, persistência em
  `onFinish`, tratamento de erro).
- `lib/hooks/use-chat-handler.ts` — `useChatHandler()`, acessor fino (`useContext`), sem
  estado/efeitos próprios.
- Montado em `app/[locale]/layout.tsx`, como irmão de `<AgentSessionProvider>`, ambos
  direto sob `<GlobalState>`.

Diferente do ADR-0002 (`AgentSessionProvider` aninhado sozinho), aqui havia uma dependência
funcional real entre os dois Providers: `handleNewChat()` precisava chamar
`useAgentSession().resetSession("__new__")`. Em vez de aninhar `ChatHandlerProvider` dentro
de `AgentSessionProvider` para viabilizar esse `useContext`, invertemos o controle: um chat
pode existir sem agente, mas todo agente precisa de um chat — então é o lado do agente que
deve reagir a um evento de ciclo de vida do chat, não o inverso. `ChatbotUIContext`/
`GlobalState` ganhou `newChatSignal: number` + `setNewChatSignal`; `handleNewChat()` incrementa
o sinal; `AgentSessionProvider` ganhou um `useEffect([newChatSignal])` que chama sua própria
`resetSession("__new__")` internamente. Resultado: os dois Providers são irmãos simétricos,
cada um só depende de `GlobalState` — nenhum importa o contexto do outro.

Migração feita em duas fases (a pedido explícito do usuário, para não deixar "legado" no
código mas também não travar a verificação atrás de uma migração de 10 arquivos de uma vez):
fase 1 manteve `components/chat/chat-hooks/use-chat-handler.tsx` como um re-export
transitório de `lib/hooks/use-chat-handler.ts`, permitindo validar o fix E2E antes de tocar
nos 10 call sites; fase 2 (última tarefa, só depois dos testes passarem) repontou os 10
imports para `@/lib/hooks/use-chat-handler` e apagou o arquivo transitório.

## Options considered

- **Option A — Manter lock module-level (`isSendingGlobally`)** — menor diff possível.
  Rejeitado: não ataca a causa raiz (múltiplas instâncias de `useChat()`), só mascarava um
  sintoma (`handleSendMessage` reentrante) que nem era a causa real da duplicação observada.

- **Option B — Aninhar `ChatHandlerProvider` dentro de `AgentSessionProvider`** —
  resolveria a dependência de `resetSession` via `useContext` direto, com menos código novo
  (sem precisar de `newChatSignal`). Rejeitado a pedido do usuário: inverte a direção de
  dependência conceitual ("chat pode existir sem agente, mas todo agente precisa de um
  chat") — o lado mais fundamental (chat) não deveria precisar importar o contexto do lado
  que depende dele (agente).

- **Option C (chosen) — Provider irmão + sinal desacoplado (`newChatSignal`)** — replica
  exatamente o padrão já estabelecido pelo ADR-0002, mantém os dois Providers simétricos e
  mutuamente independentes, e usa o mesmo mecanismo (`ChatbotUIContext`/`GlobalState` como
  ancestral comum) que já existia para outros primitivos compartilhados
  (`chatAgentSessionsRef`, `activeChatKeyRef`, `destroyChatAgentSession`).

## Consequences

**Fica mais fácil:**
- Existe um único ponto de verdade para o estado de streaming/chat (`useChat()`), chamável
  de qualquer componente via `useChatHandler()` — a duplicação de instâncias fica
  estruturalmente impossível (só existe uma).
- `onError`/`onFinish` disparam exatamente uma vez por conclusão, eliminando as escritas
  duplicadas/corrompidas no banco.
- Agora que só existe uma instância, o lock de reentrância de `handleSendMessage` pôde
  voltar a ser um `useRef` simples (`isSendingRef`) em vez de estado module-level — mais
  correto e não vaza entre montagens/testes.
- `AgentSessionProvider` e `ChatHandlerProvider` seguem exatamente o mesmo padrão
  (Context + Provider dono do estado + hook acessor fino), reduzindo a carga cognitiva de
  entender um novo Provider na árvore.

**Fica mais difícil / custos aceitos:**
- Mais um Provider na árvore, mesmo trade-off já aceito no ADR-0002 — ainda não é a
  consolidação via Zustand do [Plan 001](../plans/001-zustand-state-migration.md).
- `newChatSignal` é um mecanismo de sinalização (contador incremental) em vez de uma chamada
  direta — menos óbvio para quem lê `handleNewChat()` pela primeira vez sem o contexto deste
  ADR; o comentário no código e este documento existem para suprir isso.
- O bug de desestruturação do `onFinish` (ver log) mostra que a superfície de risco real
  desta área não é só arquitetural — o contrato exato de callbacks de bibliotecas externas
  (`ai` package) precisa ser conferido na fonte instalada, não assumido.

**Follow-up:**
- [Plan 004 — Chat Handler Strategy Pattern](../plans/004-chat-handler-strategy.md) continua
  como candidato para uma centralização mais profunda; este ADR reduz o escopo do que falta
  migrar, assim como o ADR-0002 fez para a sessão do agente.

## Related

- [ADR-0002 — Agent Session ViewModel Extraction](0002-agent-session-viewmodel-extraction.md) (padrão replicado)
- [Log de investigação (long-form)](0003-chat-handler-provider-extraction-log.md)
- [Plan 001 — Zustand State Migration](../plans/001-zustand-state-migration.md)
- [Plan 004 — Chat Handler Strategy Pattern](../plans/004-chat-handler-strategy.md)
- `context/chat-handler-context.tsx`, `components/utility/chat-handler-provider.tsx`, `lib/hooks/use-chat-handler.ts`
- `context/context.tsx` + `components/utility/global-state.tsx` (`newChatSignal`), `components/utility/agent-session-provider.tsx`
- `app/[locale]/layout.tsx`, `__tests__/playwright-test/tests/random-model-smoke.spec.ts`
