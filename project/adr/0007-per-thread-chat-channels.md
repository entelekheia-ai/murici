<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

# ADR-0007: Canais de chat por thread (streams paralelos independentes + agente ligado por sessão)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-14 |
| Deciders | Danilo Borges |
| Supersedes | — |
| Superseded by | — |
| Build on | [ADR-0003](0003-chat-handler-provider-extraction.md) (`ChatHandlerProvider` como fonte única), [ADR-0002](0002-agent-session-viewmodel-extraction.md) (`AgentSessionProvider`), [ADR-0004](0004-interactive-agent-turn-loop.md) (loop de turno do agente) |
| Last revised | — |

---

## Context

Reportado ao vivo, em três sintomas que pareciam independentes e têm duas causas comuns:

1. **Trocar de chat no meio de um stream misturava/travava as conversas** — e de forma
   *inconsistente*: sem agente costumava carregar certo, com agente travava. Causa: existe
   **uma única** instância de `useChat()` no app inteiro (`chat-handler-provider.tsx`),
   presa a um `activeChatId` que é **congelado enquanto streama** (re-key mid-stream
   abortaria a resposta em voo). Se o chat A ainda streama e você manda no chat B, o
   `append()` de B cai no store do SDK **de A**. Chats com agente streamam mais tempo (o
   loop de tool-result faz várias idas e voltas), então caem nessa janela com muito mais
   frequência — daí a "inconsistência".

2. **Vazamento de agente entre chats**: com um chat com `.agent` ativo, ao trocar para
   outro chat e mandar mensagem, o modelo respondeu que a mensagem fugia do contexto e
   seria *offtopic*. Causa: o estado da FSM é **global** — a montagem do request lê
   `context.flowState` / `context.agentPersona` (`chat-handler-provider.tsx`), e o
   `trigger_intent` no `onToolCall` lê `context.flowEngine`. Esses globais refletem o chat
   **que está sendo visualizado**, não o chat que originou a requisição. O request de B
   viajou com o `allowed_intents` + `<RULES>` do agente de A (injetados em
   `lib/server/agent-stream.ts`), e o modelo classificou corretamente — contra o agente
   errado.

3. Uma correção anterior (gate `viewedChatIdRef` na projeção e nos `flowEvents`) escondeu
   o **vazamento visual**, mas não tocou nenhuma das duas causas: o stream único e a
   ligação global do agente.

Requisito declarado: chats precisam ser **canais independentes que rodam em paralelo**,
cada um com seu `.agent` ligado.

**Topologia futura mapeada** (não construída agora, mas que a abstração não pode
inviabilizar): 1 chat com **N agentes**; cada subagente com **1 subchat** (sempre 1:1);
agentes de sistema **observando** o chat (ex.: auto-compactador que lê/edita/adiciona
histórico, sem conversar com outros agentes); `@nome` multi-agente "algum dia"; e os
agentes **headless** que já hoje rodam kernel + LLM em background, sem UI.

## Decision

1. **Um canal por thread.** Abordagem **híbrida**: o `useChat` continua sendo o **motor de
   streaming**, mas como *adaptador* atrás de uma interface de canal; a lógica de domínio
   (envio, tools, avanço de FSM, persistência, montagem do request) vive em **controllers
   vanilla** (TS puro, sem React), keyed por thread. O `useChat` vira detalhe de
   implementação do slot de motor, não o dono da lógica.

2. **Três conceitos separados** (hoje colados em "o canal"):
   - **Thread** — histórico de mensagens + superfície de UI. Chat **e** subchat são threads.
   - **Agent session** — o kernel/FSM, com **identidade própria** (`agentSessionId`).
   - **Invocation** — uma chamada de LLM em voo; pertence a uma agent session e mira uma
     thread.

   Hoje isso colapsa em 1 thread : ≤1 agente : 1 invocation por vez. O futuro descola.

3. **Chaves:** canais keyed por **`threadId`** (hoje `threadId == chatId`; subchats ganham
   threadId próprio depois). Agent sessions keyed por **`agentSessionId`** (generalização do
   `chatAgentSessionsRef`, hoje keyed por chatId). A thread **referencia**
   `agentSessionIds: string[]` — hoje sempre de comprimento 0..1.

4. **A injeção do agente e o `trigger_intent` leem a agent session que ORIGINOU a
   invocation** (por `agentSessionId`), nunca a projeção global do chat visualizado. Este é
   o conserto estrutural do vazamento *offtopic* — e já nasce compatível com N agentes,
   porque a unidade de injeção passa a ser a **sessão**, não "o agente global do chat".

5. **Montagem e ciclo de vida:** os canais são renderizados **no layout, acima da rota**
   (`app/[locale]/layout.tsx`), para sobreviverem à navegação entre chats — uma página
   (`chat/[chatid]/page.tsx`) desmonta ao navegar e mataria o stream. A rota é apenas o
   *dado de entrada* que diz **qual thread está visualizada**; quem monta/desmonta canais é
   o host, a partir do conjunto vivo:

   > **vivo = thread visualizada ∪ threads com qualquer invocation em voo**

   Um stream de background continua até o **turno inteiro** assentar (incluindo o loop de
   reenvio de tool-result). Ao terminar, se a thread não estiver visualizada, o canal de
   stream desmonta; a resposta já foi persistida.

6. **Estado:** um **store Zustand** único. Guarda apenas estado **serializável** (mensagens
   projetadas, `flowState`, persona, status, `flowEvents`), keyed por threadId /
   agentSessionId. Os **objetos vivos** (o `KernelProxy`, que tem handle WASM) **não** entram
   no store — ficam num ref-map keyed por `agentSessionId`, de posse do controller. O núcleo
   vanilla do Zustand é o que permite ao controller (sem React) escrever sem ponte de setter.

7. **Back-compat:** o canal **visualizado** espelha seu estado nos campos legados do
   `ChatbotUIContext` (`chatMessages`, `flowState`, `isGenerating`, …), de modo que os ~10
   consumidores de UI existentes **não mudam** na primeira entrega. A migração deles para
   seletores do store é rastreada no [plano 014](../plans/014-channel-store-consumer-migration.md).

8. **Ciclo de vida do kernel — inalterado.** O `Map` por-sessão já mantém o `KernelProxy`
   vivo durante a sessão do app: trocar de chat e voltar **reusa** o kernel no estado em que
   ele estava (a posição da FSM é preservada). Só um **reload do app** perde o Map, e aí o
   agente é reconstruído a partir do bundle persistido, **no estado INICIAL da FSM**.
   Retomar exatamente de onde parou fica **adiado** até o dot-agent entregar serialização de
   estado do kernel (está no backlog do dot-agent). Quando existir, este ponto é o único que
   muda.

## Options considered

- **`Map<chatId, Chat>` vanilla já agora** (instanciar a classe `Chat` do SDK direto, sem
  componente por canal, com `useSyncExternalStore`). É o caminho mais alinhado com a direção
  browser-first (planos 003/004) e força o desacoplamento do React. **Rejeitado por ora:**
  obriga a reassumir à mão a cola de streaming que o `useChat` entrega pronta (o loop do
  `sendAutomaticallyWhen`, o `addToolOutput`, o throttle) — exatamente a superfície com o
  histórico mais denso de bugs sutis do app (ADR-0003: destructuring do `onFinish`; ADR-0004:
  corrida do duplo-resubmit, duplicação de `toolCallId`). O híbrido colhe a mesma modularidade
  (lógica de domínio vanilla) **sem** reabrir essa cola, e deixa a troca do motor por um `Chat`
  vanilla/worker como mudança **aditiva atrás da interface de canal**, não como fundação.

- **Manter um `useChat` único e serializar os streams (fila).** Menor mudança. **Rejeitado:**
  não roda canais em paralelo — que é literalmente o requisito.

- **Um store por canal** (mini-store por thread, guardados num Map). Isolamento "purista".
  **Rejeitado:** as views cross-canal que vamos precisar (badge de "gerando" na sidebar do
  chat em background, o cálculo do próprio conjunto vivo) viram varredura de um Map de stores;
  um store único com um `Record` keyed por threadId dá o mesmo isolamento via seletores, com
  menos indireção.

- **Estender o `ChatbotUIContext` com um `Map<chatId, …>` + contador de versão.** Menos infra
  nova. **Rejeitado:** mantém o God-context e o re-render global que o plano 001 existe para
  matar, e um controller vanilla não consegue escrever estado do React sem ponte de setter —
  atrito no exato ponto onde queremos desacoplar.

- **Manter o estado do agente fundido no canal** (um campo `flowState` único por chat).
  **Rejeitado:** inviabiliza 1 chat : N agentes. Modelar a sessão como entidade com id próprio
  torna o N **aditivo** em vez de exigir reescrita.

## Consequences

**Fica mais fácil:**
- Chats rodam em paralelo de verdade. Um stream em background continua e **aterrissa no chat
  que o enviou**, não no que estiver na tela quando terminar.
- O vazamento *offtopic* fica **estruturalmente impossível**: a injeção lê a sessão que
  originou a invocation, não a global do chat visualizado.
- **Subchats (H1) caem redondo**: como a regra é 1 subchat : 1 subagente, cada subchat é só
  *mais uma thread* no `Record` — nenhuma reescrita.
- **Visibilidade cruzada vira política, não encanamento**: o store tem todos os canais, então
  "o subagente pode ler o stream do irmão?" é uma decisão de permissão, não de arquitetura.
- "Novo chat" deixa de precisar **abortar** o stream anterior (hoje ele chama `stop()`).
- A lógica de domínio sai dos providers-Deus para módulos vanilla testáveis (planos 001/004).

**Fica mais difícil / custos aceitos:**
- **Zustand vira dependência** (o plano 001 já previa instalar).
- Canais em background são **componentes montados, invisíveis, que renderizam `null`** — um
  padrão de aparência incomum, que só se sustenta se a casca ficar fina de verdade.
- **Invocations concorrentes numa MESMA thread continuam não cabendo** em "um `useChat` por
  thread" — o `useChat` é uma conversa com **uma** requisição em voo por vez. Isso afeta os
  observadores de sistema (H2) e o `@nome` multi-agente. O **controller é o seam** onde o
  conceito de invocation adicional entra; esse trabalho fica **adiado** e documentado no
  [plano 015](../plans/015-future-agent-topology.md).
- Durante a transição há **duas fontes de verdade** (a fatia do canal + o espelho legado no
  Context) até o plano 014 terminar.
- Um agente **revivido após reload** do app recomeça no **estado inicial** da FSM.

## Related

- `components/utility/chat-handler-provider.tsx` (o `useChat` único e o `requestCtxRef` global — o que este ADR desmonta)
- `components/utility/agent-session-provider.tsx` (`chatAgentSessionsRef`, `loadAgentBundle`, revival no estado inicial)
- `lib/server/agent-stream.ts` + `lib/runtime/dot-agent-injector.ts` (onde `behaviorState`/`agentPersona` são injetados no prompt)
- [Plano 014](../plans/014-channel-store-consumer-migration.md) — migrar consumidores para fora do espelho legado
- [Plano 015](../plans/015-future-agent-topology.md) — subagentes, observadores, multi-agente
- Planos [001](../plans/001-zustand-state-migration.md) (Zustand), [003](../plans/003-web-worker-agent-hub.md) (worker hub), [004](../plans/004-chat-handler-strategy.md) (strategy) — este ADR realiza parte dos três
