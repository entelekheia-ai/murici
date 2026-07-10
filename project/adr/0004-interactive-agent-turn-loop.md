<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

# ADR-0004: Loop de turno do agente interativo (FSM + tool results + injeção) e espelho de debug do fio

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-09 |
| Deciders | Danilo Borges |
| Supersedes | — |
| Superseded by | — |
| Build on | [ADR-0003](0003-chat-handler-provider-extraction.md) (fonte única via `ChatHandlerProvider`), [ADR-0002](0002-agent-session-viewmodel-extraction.md) (`AgentSessionProvider`) |

---

## Context

Depois do ADR-0003 (extração do `useChat()` para um único dono, `ChatHandlerProvider`,
com projeção one-way `SDK → chatMessages`), a camada de `.agent` **interativa** continuava
quebrada. O refactor de fonte única deixou o cliente fino (`append({ text })`) e, com isso,
**derrubou várias integrações** que o antigo `handleFlowChat` (`chat-helpers/index.ts`,
agora morto) fazia. Sintomas encontrados ao vivo, um destravando o próximo:

1. Ao mandar a primeira mensagem, o `.agent` sumia da tela (a sessão ficava órfã no bucket
   `"__new__"`).
2. O modelo não recebia persona/RULES/estado do FSM — improvisava e vazava tool call como
   JSON de texto (`{"name":"mcp__…"}`).
3. Tool calls não executavam com os args certos e, mesmo executando, o resultado não voltava
   pro modelo → `AI_MissingToolResultsError` no turno seguinte.
4. `trigger_intent` não avançava o FSM (o evento `murici:tool_call` não tinha ouvinte e
   `send_intent` só era chamado no `headless-runner`).
5. O `.agent` não tinha visibilidade: o painel de debug consolidava em blocos e o "enviou"
   ficava vazio.

A raiz comum: **o loop de turno do agente** (usuário → modelo decide intent → FSM avança →
o modelo responde com o novo estado) nunca foi re-conectado sobre a arquitetura de fonte única.

## Decision

### 1. Injeção de prompt restaurada no servidor (não no cliente)
A rota `app/api/chat/custom/route.ts` reconstrói o que o `buildFinalMessages` fazia no cliente,
usando o que já chega no body (`chatSettings`, `behaviorState`) mais `agentPersona` (novo):

- **`system` estático** = `<PERSONA>` + instruções + `<RULES>` — byte-idêntico por turno, então
  o prefixo cacheia (KV-cache do provider).
- **Estado do FSM dinâmico** = um par simulado `get_current_state` (tool-call/result em shape
  `ModelMessage`, via `injectBehaviorContextModelMessages`) espremido **só no primeiro turno**
  (quando a última mensagem é `user`). Nos resubmits o estado novo já viaja no result do
  `trigger_intent`, então re-injetar seria redundante/velho.

Motivo de ficar no servidor: a rota é nossa e já recebe `behaviorState`; mantém o cliente fino.
As tools (built-in, MCP, wire) vão no parâmetro `tools` do `streamText` — **não** no histórico —
montadas por request a partir de `mcpTools`; são cache-friendly enquanto o conjunto não muda.

### 2. `trigger_intent` avança o FSM no `onToolCall` e reporta o novo estado como resultado
- O `onToolCall` (dono do contexto React) chama `context.flowEngine.send_intent(intent)` (awaited),
  reconstrói o `flowState` via helper compartilhado `lib/runtime/advance-flow.ts`
  (`buildFlowStateFromEffects`, mesmo transform que o `loadBehavior` usa), `setFlowState` (só view),
  e **retorna o novo estado como o output da tool**. O estado viaja pro modelo *dentro do histórico*
  no resubmit — sem canal lateral de `behaviorState`, sem corrida entre avanço e resubmit.
- `murici:tool_call` continua sendo disparado só para o painel de debug.

### 3. Output de tool client-side registrado via `addToolOutput` (o retorno do `onToolCall` é ignorado)
A SDK v5 **descarta** o valor de retorno do `onToolCall` (`ai/dist`: `await onToolCall({toolCall})`).
O output tem que ser gravado com `addToolOutput({tool, toolCallId, output})`, que também marca a parte
como `output-available` e dispara o resubmit. Retornar valor deixava a tool call sem resposta →
`AI_MissingToolResultsError`.

### 4. `sendAutomaticallyWhen` idempotente, com resubmit **one-shot por turno**
É o substituto do `maxSteps` do v4. A SDK chama esse callback **mais de uma vez por passo** e dispara
o resubmit de **dois pontos independentes** (`ai/dist` v7.0.16: fim do `makeRequest` `:16714` E dentro
do `addToolOutput` `:16505`), ambos só protegidos por `status`, com uma janela de corrida entre eles.
Como o `addToolOutput` é fire-and-forget (roda no mesmo `SerialJobExecutor` que já está executando o
`onToolCall`, então `await` daria deadlock), o output cai num instante imprevisível — se cair na janela
de microtask, **os dois gatilhos disparam** e o turno é POSTado 2× (um modelo local que reusa `call_`
id re-emite a tool call → o `toolCallId` duplicado). Pureza não resolve isso (não deduplica o gatilho).
Dois guards idempotentes:
- **cap de runaway** (`MAX_AUTO_STEPS`) derivado das `messages` (tool-calls desde a última `user`);
- **one-shot por id** da mensagem-assistant que carrega as tool calls (`resubmittedTurnsRef: Set`) — o
  primeiro gatilho resubmete, o outro vira no-op. Dedupe por identidade (`Set.has/add`), **não** um
  contador monotônico (que over-contava). Limpo por chat novo.

### 5. Guard de intent inválido (com rejeição direcionada)
Antes de avançar, valida `intent_name` contra `flowEngine.get_valid_intents()`. Se não for permitido
no estado atual, devolve como output (sem avançar) uma rejeição **direcionada**: `{ error, current_state,
goal, allowed_intents }` dizendo que a transição já ocorreu e que o modelo deve **responder em texto**
(não re-chamar tool) — impede o FSM de ir pro lugar errado por uma tool call velha/duplicada e faz o
modelo se recuperar num passo. Client-side, sem custo de cache — é a rede de segurança pro caso raro de
re-disparo em temp>0 (o modelo em uso não re-dispara no ponto de decisão limpo — ver log §9).

### 6. `stop()` ao começar uma conversa nova
`handleNewChat` aborta o stream em andamento, senão a resposta do chat anterior vaza para ele (e um
resubmit poderia disparar depois da troca).

### 7. Body do request pelo transport (`prepareSendMessagesRequest`)
O transport injeta `customModel/chatSettings/behaviorState/agentPersona/mcpTools` (de um ref
atualizado a cada render) em **todo** request — primeiro send E resubmit automático. Sem isso o
resubmit ia com body vazio e a rota estourava "base_url required".

### 8. Contrato de tool call: `input` → `args`
Tool calls v5 (`Static`/`DynamicToolCall`) carregam args em `input`, não `args`. `normalizeToolCall`
(`lib/tools/normalize-tool-call.ts`, com teste unitário) é o único ponto que mapeia — ler `.args`
direto dava `undefined` e estourava os executores (ex.: `trigger_intent`: "Cannot read … intent_name").

### 9. Debug = espelho do fio, em tempo real e distribuído
Substitui o painel consolidado (`FlowSystemDebugBubble` + `flowDebugLog` + `useDebugSync`, agora sem uso):

- **Servidor**: emite uma parte transitória `data-debug` (via `createUIMessageStream` + `writer.write`)
  com o `system` + as `messages` finais que **de fato** foram pro modelo (pós-injeção).
- **Cliente**: cada passo do exchange vira um `flowEvent` (`client_request`, `server_prompt`,
  `tool_call`, `fsm_transition`, `tool_result`, `llm_response`, `error`) empurrado na hora.
- **Render**: `chat-messages.tsx` intercala os eventos com as mensagens **por timestamp, cada um seu
  card**, sem consolidar em blocos.

## Options considered

- **Injeção no cliente (reviver `buildFinalMessages`)** vs **no servidor**: escolhido servidor (cliente
  fino, rota é nossa, `behaviorState` já chega lá). O cliente brigaria com o modelo de mensagens da SDK.
- **Avançar o FSM num listener de `murici:tool_call` no `AgentSessionProvider`** vs **no `onToolCall`**:
  escolhido `onToolCall` porque a SDK aguarda ele resolver antes de decidir o resubmit — mata a corrida
  entre "avançar" e "reenviar". O listener event-driven avançaria depois que o `onToolCall` já retornou.
- **Debug consolidado (bloco por turno)** vs **espelho por evento**: escolhido espelho — a fonte única
  (`useChat().messages`) já é distribuída/real-time; consolidar era re-derivação com perda (e "enviou"
  ficava `[]`).

## Consequences

- O caminho do agente interativo funciona fim-a-fim: intent → avanço do FSM → resposta da persona.
- `chat-helpers/index.ts` (`handleFlowChat`/`buildFinalMessages`) e `use-debug.ts` /
  `flow-debug.ts` / `flow-system-debug-bubble.tsx` ficaram **sem uso** — dívida de limpeza.
- A injeção foi **extraída pro helper `lib/server/agent-stream.ts`** e aplicada às **9 rotas** de
  provider (custom + os outros 8) — antes só `custom` injetava (log §12). Follow-up: reintroduzir o
  breakpoint de prompt-cache do anthropic sobre o `system` (removido por virar no-op).
- O `system` estático + estado no result mantêm o prefixo cacheável; qualquer injeção dinâmica quebra
  cache a partir da posição dela (por isso só no 1º turno).

## Duplicação de tool call — diagnóstico FECHADO, mitigado (ver log §13)

- **Causa confirmada:** cópia **fantasma** no caminho de resubmit de tool-result. O logger no
  `onToolCall` provou (num chat **sem FSM**, só `save_doc`): a tool executa **1×** mas o store termina
  com **2 mensagens distintas** carregando o mesmo `toolCallId` (`dupToolCallIds:true`,
  `dupMessageIds:false`). Não é o modelo, não é o FSM, não é double-execute — reconcilia as seções 8–11.
- **Mitigação (decisão 10, abaixo):** `dedupeToolCallParts` colapsa `toolCallId` repetidos (mantém a 1ª
  ocorrência, com output) na **saída pro modelo** e na **projeção**. Erradicar na origem do SDK (por que
  o resubmit empurra a cópia; suspeito `createStreamingUIMessageState` `ai/dist:6469`) é follow-up.

### 10. Dedupe de tool-call fantasma (`dedupeToolCallParts`)
O resubmit de tool-result deixa o store do SDK com uma **cópia** da parte tool-call (mesmo `toolCallId`,
mensagem nova) sem re-executar. `lib/ai/ui-message-parts.ts::dedupeToolCallParts` colapsa por identidade —
mantém a 1ª ocorrência (tem o output executado), dropa cópias posteriores, remove mensagem que só existia
pra carregar a cópia. Aplicado no `prepareSendMessagesRequest` (o modelo nunca vê o id 2× → sem cascata /
`MissingToolResults`) e na projeção (UI/persistência limpas). A sonda fica na lista crua pra flagrar
recorrência. É mitigação no nosso boundary, não conserto na origem do SDK.

## Related

- Novos: `lib/runtime/advance-flow.ts`, `lib/tools/normalize-tool-call.ts` (+ teste),
  `lib/runtime/dot-agent-injector.test.ts`, `lib/server/providers/reasoning-content-fetch.ts`
  (fix `fetch` lazy), `scripts/agent-loop-repro.mjs` (harness de isolamento us/stream/model — curl direto
  no modelo, replay do JSON capturado, ver log §9), `lib/server/agent-stream.ts`
  (`streamAgentResponse`, injeção+debug compartilhados pelas 9 rotas, log §12).
- Rotas alteradas (usam o helper): `app/api/chat/{custom,openai,anthropic,google,mistral,groq,perplexity,openrouter,azure}/route.ts`.
  `jest.setup.ts` ganhou polyfill de `TextEncoderStream`/`TextDecoderStream`.
- Alterados: `components/utility/chat-handler-provider.tsx`, `.../agent-session-provider.tsx`,
  `lib/runtime/dot-agent-injector.ts`, `app/api/chat/custom/route.ts`,
  `components/messages/flow-event-card.tsx`, `components/chat/chat-messages.tsx`,
  `types/flow-event.ts`.
- Log detalhado: [0004-interactive-agent-turn-loop-log.md](0004-interactive-agent-turn-loop-log.md).
