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
| Last revised | 2026-07-09 — fonte única de verdade + reasoning_content (ver seção Update) |

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

## Update (2026-07-09): fonte única de verdade + reasoning_content

A extração do `ChatHandlerProvider` (acima) matou o problema de múltiplas instâncias, mas o
Provider ainda mantinha **dois donos da verdade** para as mensagens — `useChat().messages` (do
SDK) e `ChatbotUIContext.chatMessages` (à mão) — espelhados **token-a-token nas duas direções**,
com `sequence_number` recalculado em vários lugares e o `id` do `useChat` trocado no meio do
stream. Isso causava três sintomas reportados ao vivo: o bloco `<think>` sumindo quando o stream
terminava, um spinner de loading que às vezes travava, e uma demora perceptível depois do Enter.
O usuário também apontou, corretamente, que "travar" o `id` do `useChat` (que deveria ser dinâmico
e associado ao chat) era uma decisão equivocada — sintoma do store duplo, não a causa.

**Decisão:** `useChat().messages` passa a ser a **fonte única de verdade**. O Provider faz só três
coisas com ela, sem espelhar nada de volta token-a-token:
- **seed** uma vez por chat (do banco, ao abrir);
- **projeção one-way** SDK → `chatMessages`, para os ~10 consumidores continuarem lendo a lista no
  formato do banco sem nenhum deles importar `@ai-sdk/react` (a fronteira que mantém o SDK
  trocável em um arquivo depois — ex. [Plan 001](../plans/001-zustand-state-migration.md) / camada
  transport+Zustand);
- **persistência** no banco no `onFinish`, sob o id da própria mensagem do SDK.

Correções que caíram dessa mudança:
- **Id do chat estável, alocado no cliente** e reusado como id do chat no banco no primeiro envio —
  o store por-id do `useChat` nunca é trocado no meio do stream (causa do spinner travado). Resolve
  na raiz o "id travado" que o usuário apontou.
- **`thinkingLog` re-chaveado por id da mensagem** (não `sequence_number`) e a mensagem do
  assistente persistida sob o id do SDK → o raciocínio sobrevive ao handoff streaming→persistido
  (causa do `<think>` sumir no fim do stream).
- **MCP tools pré-carregadas e cacheadas** fora do caminho crítico do envio (causa da demora).
- **`isGenerating` seguindo o status do stream** — nada zerava isso num finish bem-sucedido antes
  (só no erro); bug latente, não introduzido aqui.

**reasoning_content (o `<think>` que nunca aparecia):** a causa real **não era o render**. Modelos
locais de raciocínio (Qwen3, gpt-oss, DeepSeek-style via oMLX/Ollama) transmitem o raciocínio em
`delta.reasoning_content`, não em tags `<think>`. Duas coisas o descartavam: (1) `custom(id)` do
`@ai-sdk/openai` batia no `/v1/responses` (Responses API), cujo formato de stream é outro e onde os
servidores locais nem expõem `reasoning_content` — forçado `.chat()` (`/v1/chat/completions`); (2)
mesmo lá, o provider não mapeia `reasoning_content` — um shim de `fetch`
(`withReasoningContentAsThink`) dobra ele no stream de texto como `<think>…</think>`, e o
`extractReasoningMiddleware({ tagName: "think" })` que já existia converte em reasoning parts. Sem
troca de provider, sem dependência nova, tool-calling intacto. (Mesma ideia do commit pré-refactor
"support delta.reasoning_content for local reasoning models", adaptada ao stack atual de
`streamText` + middleware.)

**Verificação (oMLX real):** smoke 3/3 (resposta + bloco de think nos dois modelos de raciocínio,
Qwen3.5-9B e gpt-oss-20b), tool-calling 2/2 (sem regressão do `.chat()`), `tsc` limpo, `jest`
44/45 (a mesma falha pré-existente e não relacionada). Commits `c4987c0` (fonte única) e `6f73cd0`
(reasoning_content + retrabalho do teste). Log detalhado na continuação de
[`0003-chat-handler-provider-extraction-log.md`](0003-chat-handler-provider-extraction-log.md).

## Related

- [ADR-0002 — Agent Session ViewModel Extraction](0002-agent-session-viewmodel-extraction.md) (padrão replicado)
- [Log de investigação (long-form)](0003-chat-handler-provider-extraction-log.md)
- [Plan 001 — Zustand State Migration](../plans/001-zustand-state-migration.md)
- [Plan 004 — Chat Handler Strategy Pattern](../plans/004-chat-handler-strategy.md)
- `context/chat-handler-context.tsx`, `components/utility/chat-handler-provider.tsx`, `lib/hooks/use-chat-handler.ts`
- `context/context.tsx` + `components/utility/global-state.tsx` (`newChatSignal`), `components/utility/agent-session-provider.tsx`
- `app/[locale]/layout.tsx`, `__tests__/playwright-test/tests/random-model-smoke.spec.ts`
- **Update 2026-07-09:** `lib/server/providers/reasoning-content-fetch.ts` (shim reasoning_content→`<think>`), `app/api/chat/custom/route.ts` (`.chat()` + shim), `lib/ai/ui-message-parts.ts` (accessors só-parts — a fronteira do modelo de dados), `components/messages/message-thinking-block.tsx` (`data-testid`), `playwright.config.ts` (serial, `workers: 1`)
