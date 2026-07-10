<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 Licensed under the Apache License, Version 2.0
-->

# Log — ADR-0004: Loop de turno do agente interativo + espelho de debug

Registro long-form da investigação (2026-07-09). Cada sintoma destravava o próximo. Write-once;
não retro-editar — anexar seções novas se o assunto evoluir.

## 0. Ponto de partida

ADR-0003 entregou a fonte única (`ChatHandlerProvider`, um `useChat()`, projeção one-way). Mas o
`.agent` interativo seguia quebrado: sem `<think>` às vezes, spinner preso, delay pós-Enter — e,
mais fundo, o agente/MCP não funcionava de verdade.

## 1. `.agent` some na primeira mensagem

**Causa:** `handleSendMessage` criava o chat e fazia `setSelectedChat` direto, sem
`migrateChatAgentSession("__new__", newId)`. A sessão do agente ficava órfã no bucket `"__new__"`;
o efeito `[selectedChat?.id]` do `AgentSessionProvider` via um id novo sem sessão, montava uma
**em branco**, e zerava `flowState`/persona. Onboarding e drop na right-sidebar já migravam; o
caminho "digitar e Enter" era o único que faltava.
**Fix:** migração no `handleSendMessage` antes do `setSelectedChat`.

## 2. Camada de injeção de prompt derrubada pelo refactor

Sintoma: modelo vazava `{"name":"mcp__dot-agent__send_offtopic"}` como texto. **Causa real:** o
cliente fino (`append({text})`) não chamava mais `buildFinalMessages`, e a rota não injetava
persona/RULES/estado. O modelo recebia histórico cru + tools e **zero instrução** → improvisava.
`buildFinalMessages` só era chamado pelos handlers mortos em `chat-helpers/index.ts`.
**Fix:** injeção server-side (decisão 1 do ADR). Split escolhido pelo usuário: persona+RULES no
`system` estático; estado do FSM como fake `get_current_state` (mantém o header cacheável).

## 3. `input` vs `args` + resultado da tool não voltava

- Native tool call passou a acontecer (RULES funcionando), mas `[ToolOrchestrator] … Cannot read
  properties of undefined (reading 'intent_name')`: v5 carrega args em `input`, o orchestrator lia
  `.args`. **Fix:** `normalizeToolCall` (`input`→`args`) + teste unitário determinístico.
- Depois: `AI_MissingToolResultsError` no 2º turno. Log mostrou **nenhum POST de resubmit** entre os
  turnos → o resultado da tool nunca era gravado. **Causa:** a SDK **descarta** o retorno do
  `onToolCall` (`ai/dist:6861`: `await onToolCall({toolCall})`). **Fix:** `addToolOutput(...)` +
  `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` (v5 no lugar de `maxSteps`).
- Robustez: `onError` no `toUIMessageStreamResponse`/stream para `AI_NoOutputGeneratedError` (modelo
  devolvendo vazio) não derrubar o dev server como `unhandledRejection`.

## 4. "Travou no think" → FSM nunca avançava

Com o modelo chamando `trigger_intent` certo, o turno travava no think sem resposta. **Causa:**
`runTriggerIntent` dispara `murici:tool_call` e **ninguém escuta**; `send_intent` (o que avança o
FSM) só era chamado no `headless-runner`, nunca no interativo. O modelo, sem ver o estado mudar,
re-classificava e re-disparava — loop sem texto.
**Fix:** avanço no `onToolCall` (decisão 2), com helper `advance-flow` compartilhado com o
`loadBehavior`; injeção do `get_current_state` só no 1º turno (o estado novo vem no result).

## 5. Espelho de debug (fio completo, tempo real, inline)

Pedido do usuário: debug como espelho do JSON de troca de mensagens, **entre as mensagens, sem
consolidar, na ordem que acontece**. Reaproveitado o mecanismo `flowEvents`/`FlowEventCard` (que só
o `handleFlowChat` morto populava). Servidor emite `data-debug` transitório (system + messages reais
pós-injeção) via `createUIMessageStream`; cliente empurra um `flowEvent` por passo; render intercala
por timestamp. `useDebugSync`/`FlowSystemDebugBubble` saíram do fluxo. Fidelidade: escolha do usuário
foi **fio completo** (inclui o lado servidor).

Esse debug **provou** a causa dos bugs seguintes.

## 6. Intent no lugar errado + duplicação (via debug)

O trace mostrou: no resubmit o modelo **ignora o estado novo** (raciocínio ainda diz "state:
responsive") e re-dispara `trigger_intent("Suggest a recipe")` — que **não** está nos
`allowed_intents` do estado atual (`suggest_recipe`). E o **mesmo `toolCallId` aparecia 2–3×**.
**Fixes técnicos:**
- Guard de intent inválido (decisão 5) — rejeita e devolve `allowed_intents` sem corromper o FSM.
- `stop()` no `handleNewChat` (decisão 6) — resposta antiga não vaza pra conversa nova.

## 7. `sendAutomaticallyWhen` tem que ser puro

Insight do usuário: "talvez não seja o oMLX que duplica o id, é algo no nosso fluxo". Confirmado no
fonte: `sendAutomaticallyWhen` é chamado **mais de uma vez por passo** (do `addToolOutput` E do fim
de stream — `ai/dist:16475`, `:16505`). O wrapper anterior fazia `autoStepRef.current++` (efeito
colateral) a cada chamada → over-conta e pode **amplificar para resubmit duplo**. **Fix:** tornar o
callback **puro/idempotente**, derivando o teto das `messages` (conta tool-calls desde a última
mensagem `user`). Sonda adicionada na projeção (`dupMessageIds`/`dupToolCallIds`) para localizar a
duplicação restante no próximo teste.

## 8. Duplicação de `toolCallId` — causa raiz achada e corrigida

O teto puro (seção 7) parou o over-count mas **não** a duplicação: no teste seguinte o `call_…`
seguia aparecendo 2× — inclusive na tool de salvar (`call_85981d48` 2×), não só em intent. Logo não é
prompt do modelo; é o fluxo. Rastreado lendo o `ai/dist` instalado (v7.0.16):

- `onToolCall` (`index.js:6862`) roda **dentro** de um job do `SerialJobExecutor`
  (`runUpdateMessageJob`, `:6492`). Nosso `addToolOutput` enfileira **outro** job no mesmo executor
  serial → não dá pra `await` (deadlock), por isso é fire-and-forget. Esse output cai num instante
  imprevisível.
- Existem **dois gatilhos de resubmit independentes**, ambos só protegidos por `status`:
  fim do `makeRequest` (`:16714`, `if(!isError && await shouldSendAutomatically()) makeRequest`) e
  dentro do `addToolOutput` (`:16505`). Se o output diferido cai na janela de microtask entre
  `setStatus("ready")` (`:16684`) e o resubmit virar `status="submitted"`, **os dois disparam** → o
  mesmo turno é POSTado 2×; um modelo local que reusa `call_` id re-emite a tool call → o id
  duplicado. Como a save/MCP também é async no `onToolCall`, atinge qualquer tool.

Pureza não deduplica o **gatilho**. **Fix:** guard one-shot por id da mensagem-assistant que carrega
as tool calls (`resubmittedTurnsRef: Set<string>`) dentro do `sendAutomaticallyWhen` — o primeiro
gatilho resubmete, o outro vira no-op. É dedupe por identidade (idempotente, `Set.has/add`), não o
contador monotônico que over-contava; o teto `MAX_AUTO_STEPS` continua como cap de runaway. Limpo por
chat novo (`handleNewChat`). Isso vira a **decisão 4** do ADR (revisada). Sonda `dupToolCallIds` fica —
se ainda duplicar depois disso, é definitivamente o modelo re-emitindo (domínio das RULES).

## 9. Isolamento us/stream/model via curl direto no modelo — modelo inocentado

Pra fechar de vez "é a gente, a stream ou o modelo", montei um harness que fala **direto** com o oMLX
(`:8000`, OpenAI-compat), sem a rota Next / AI SDK / useChat / onToolCall: `scripts/agent-loop-repro.mjs`.
Ele carrega o JSON **real** capturado (shape `data-debug` `{system, messages}` ou OpenAI), reconstrói a
tool `trigger_intent` a partir do último `allowed_intents`, e replica em 3 formas — inclusive **cortado no
1º `trigger_intent` + seu result** (o ponto de decisão do resubmit, limpo).

Rodado com o JSON real do usuário no modelo real (`Qwen3.5-9B-OptiQ-4bit`, 5×, temp 0.5):

| Cenário | Resultado (5/5) |
|---|---|
| trimmed no 1º transition (`system+user+trigger_intent+show_catalog`) | **TEXT** — lista as receitas, nunca re-dispara |
| capture as-is (histórico cheio) | **TEXT** — responde certo |
| capture + reinjeção | **TEXT** — responde certo |

**Conclusão: não é o modelo.** No exato ponto onde o trace mostrava o `call_861e9693` duplicado, o
modelo faz a coisa certa 5/5 (responde em texto, não re-dispara). Os dois `trigger_intent` com o
**mesmo** id no histórico batem com uma mensagem duplicada (resubmit-duplo + oMLX reusando id), não com
duas gerações independentes. Ou seja: confirma a seção 8 — a causa é o **resubmit-duplo do cliente**, e o
**guard one-shot é o fix**. (Nuance: temp>0 pode raramente re-disparar; por isso a rejeição de intent
endurecida — client-side, custo zero de cache — fica como rede de segurança.)

## 10. Reinjeção de estado no resubmit — adicionada e **revertida** (não era necessária)

No meio da investigação eu havia mudado `injectBehaviorContextModelMessages` pra **re-afirmar** o estado
do FSM a cada resubmit (hipótese: modelo fraco ignora o estado no result do `trigger_intent`). O teste da
seção 9 derrubou essa hipótese pro modelo em uso, e a reinjeção **quebra o cache** de prompt em turnos
multi-tool (contra a decisão 1). Então **revertida** — o injector volta a injetar só no 1º turno. Ficam:
o guard one-shot (fix real, decisão 4) e a **mensagem de rejeição endurecida** da decisão 5 (agora diz ao
modelo que a transição já ocorreu e pra responder em texto, em vez de só "não permitido"; sem custo de
cache). O harness `scripts/agent-loop-repro.mjs` fica versionado pra reusar.

## 11. Guard one-shot NÃO fechou — ainda duplica (cópias byte-idênticas) — REABERTO

Teste ao vivo do usuário com o guard ligado: **ainda duplica**. Novo trace mostra o mesmo
`call_2cacd95a` repetido 2–4× e — decisivo — o bloco de `reasoning` é **byte-a-byte idêntico** em todas
as cópias, todas raciocinando a partir do estado **`responsive`** (o 1º turno). Num modelo a temp 0.5,
reasoning longo idêntico não sai por acaso: **são cópias da MESMA geração**, não gerações independentes.
Isso *reforça* a seção 9 (não é o modelo) mas mostra que o guard one-shot era **necessário porém
insuficiente** — ele mata o double-trigger de um mesmo id de mensagem, não a cópia da mensagem.

**Suspeito principal (SDK):** `createStreamingUIMessageState` (`ai/dist:6469`) — quando um resubmit
começa e a última mensagem é `assistant`, o novo estado de streaming **reusa o objeto lastMessage
inteiro** (reasoning + tool-call + id), em vez de começar vazio. Combinado com o loop multi-passo
(cada resubmit vira uma nova mensagem "completa com tool-calls" → dispara outro resubmit até
`MAX_AUTO_STEPS`), é caminho plausível pras cópias idênticas. **Não conclusivo** — precisa do logger.

**Logger decisivo adicionado** (`chat-handler-provider` `onToolCall`): loga cada invocação com
`{toolCallId, intentName, kernelState, kernelValidIntents, reactFlowState}`. No próximo teste isso
separa de vez: se o `onToolCall` loga N× pro mesmo id → re-fire real; se loga 1× mas aparece N× no
histórico → cópia fantasma (store/SDK). `kernelState` vs `reactFlowState` pega o outro suspeito: o
resubmit re-oferecer os intents ANTIGOS porque o `setFlowState` (React async) não propagou antes do
`prepareSendMessagesRequest` ler o `requestCtxRef` — o que explicaria o "raciocina de responsive".

**Status: REABERTO.** O guard one-shot + a rejeição endurecida + o isolamento (não é o modelo) ficam;
a causa final da cópia é o próximo alvo, guiado pelo logger acima.

## 12. Injeção replicada nas 9 rotas via helper compartilhado + polyfill de teste

A pedido do usuário ("aplica pras outras rotas") antes do commit. Extraído `lib/server/agent-stream.ts`
(`streamAgentResponse`) com a ÚNICA implementação da injeção (persona/RULES no `system` + get_current_state
no 1º turno) + o espelho `data-debug` + `onError`. As 9 rotas (`custom`, `openai`, `anthropic`, `google`,
`mistral`, `groq`, `perplexity`, `openrouter`, `azure`) agora só constroem o model e chamam o helper —
antes só `custom` injetava, então em qualquer outro provider o modelo recebia histórico+tools com ZERO
instrução. Notas: (a) o breakpoint de prompt-cache do anthropic foi removido (era no-op agora que o
`system` vai por parâmetro, não como 1ª mensagem) — re-fazer é follow-up; (b) `custom` mantém seu model
wrapado (reasoning + tool-leak middleware) e passa pro helper. Teste: `jest.setup.ts` ganhou polyfill de
`TextEncoderStream`/`TextDecoderStream` (o `createUIMessageStreamResponse` real que o helper usa pipa por
eles, e o env `node` do jest não os tinha — antes o `custom` devolvia o método MOCK e nunca batia nisso).

## Verificação (2026-07-10)

`tsc` limpo. `jest` 50/51 (única falha: `openapi-conversion.test.ts:342` "stocksTicker", pré-existente no
HEAD, fora do diff). Rota `custom` coberta pelo `route.test.ts` (passa após o polyfill). **Duplicação
ainda aberta** — commit desse estado a pedido do usuário, pra explorar com o logger no próximo round.
