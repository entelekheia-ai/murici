<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

# Log — ADR-0007 (canais de chat por thread)

Registro long-form da implementação. O ADR é a decisão; este arquivo é o traço:
o que foi feito, o que foi descoberto no caminho, e o que ficou pendente.

---

## §1. Estado da entrega

**Estágios 1 e 2 do plano: concluídos.** `type-check`, `build`, `jest` (84 passam; a
falha em `__tests__/lib/openapi-conversion.test.ts` é **pré-existente** e não
relacionada) e Playwright (6 passam, 0 falham, 5 pulam por dependerem de um servidor
de modelo local) — todos verdes.

**Pendente:**
1. Verificação manual do usuário no Electron real (os cenários originais: agente +
   troca de chat sem virar offtopic; resposta em background aterrissando no chat de
   origem com o spinner na sidebar; o chat com agente que travava).
2. Rodar os 5 specs que dependem de modelo local (precisam do servidor ligado).
3. **Estágio 3 (limpeza)** — ver §6.

## §2. Arquivos

**Novos:**
- `lib/store/channel-store.ts` — Zustand. Deliberadamente pequeno: `viewedThreadId` +
  `channels: Record<threadId, {status, firstTokenReceived}>`. As **mensagens por canal
  não estão aqui** — elas já vivem dentro do `useChat` de cada canal, que É o store de
  mensagens por thread. O store só guarda o que alguém de FORA do canal precisa saber
  (o conjunto vivo, o badge de "gerando").
- `lib/channels/channel-controller.ts` — toda a lógica de domínio, TS puro, sem React.
- `lib/channels/registry.ts` — `Map<threadId, ChannelController>` module-level; a
  fachada acha o controller do chat visualizado aqui.
- `components/utility/chat-channel.tsx` — a casca do `useChat` (renderiza `null`).
- `components/utility/channel-host.tsx` — o conjunto vivo.

**Modificados (principais):**
- `components/utility/chat-handler-provider.tsx` — de 780 linhas para ~100. Virou
  fachada: publica o `viewedThreadId`, cuida do ciclo de "novo chat", e delega
  send/stop ao controller do canal visualizado. **A API de 6 membros do
  `useChatHandler()` não mudou**, então os 10 consumidores não foram tocados.
- `components/utility/agent-session-provider.tsx` — chaveia por `viewedThreadId` (do
  store) em vez de `selectedChat?.id ?? "__new__"`.
- `context/context.tsx` + `global-state.tsx` — entrou `updateChatAgentSession`; saíram
  `activeChatId`, `migrateChatAgentSession` e `newChatSignal`.
- `components/sidebar/items/chat/chat-item.tsx` — o spinner de "gerando", lido direto
  do store (**zero prop-threading**: `sidebar.tsx`, `sidebar-content.tsx` e
  `sidebar-data-list.tsx` não mudaram).

## §3. Bug REAL pré-existente, achado e corrigido de brinde

O `isGenerating` era limpo por um efeito **edge-triggered** (só na transição
`isStreaming` → idle) **e** gated no chat visualizado
(`chat-handler-provider.tsx:669-678`, código antigo). Consequência: sair de um chat no
meio do stream e voltar **depois** que ele terminou → nenhuma transição roda enquanto
você olha → `isGenerating` fica **travado em `true`**, com o botão de enviar congelado
como "Stop".

É quase certo que era o **"com agente travou"** reportado (chats com agente streamam
mais tempo por causa do loop de tool-result, então caem nessa janela com muito mais
frequência).

**Fix:** o espelho de `isGenerating`/`firstTokenReceived` agora é **derivado** do status
do canal (`chat-channel.tsx`), não escrito por efeito de borda. Um espelho derivado não
tem como travar. Também removi o `setIsGenerating(true)` manual do `handleRegenerate`
(`components/messages/message.tsx`), que virou redundante — e que era exatamente o tipo
de escrita manual que ninguém limpava depois.

## §4. `__new__` e `migrateChatAgentSession`: eliminados

Uma thread **nasce com o id final** (um `crypto.randomUUID()` mintado no
`ChatHandlerProvider`); o primeiro envio só cria a linha do chat **sob aquele mesmo id**.
Como o id nunca muda, não há o que migrar. Isso removeu:
- o bucket mágico `"__new__"`,
- o `migrateChatAgentSession` (e seu uso no `right-sidebar.tsx`),
- o `newChatSignal` + o `resetSession("__new__")`.

O onboarding (`right-sidebar.tsx`) foi reescrito no mesmo espírito: carrega o agente na
thread que **já está na tela** e cria a linha do chat **sob o id dela** (substituindo o
`handleCreateChat` do `chat-helpers`, que não aceitava id). Esse passo de migração era a
origem da classe de bug do ADR-0002 ("novo chat herdando o agente anterior").

**Leak evitado:** como cada thread nova cria um `KernelProxy` (worker), o `handleNewChat`
destrói a sessão da thread não-enviada que está sendo abandonada.

## §5. Testes — e a lição que quase passou batido

Specs em `__tests__/playwright-test/tests/channel-agent-isolation.spec.ts`. São
**stubados** (`page.route` em `**/api/chat/**` devolvendo SSE do AI SDK v5), então
**não precisam de servidor de modelo** e são determinísticos.

### §5.1. Um teste do vazamento SÓ discrimina no caminho OFF-SCREEN

A primeira versão do teste "dois chats com agente" **não pegava o bug**. Motivo: abrir o
segundo chat faz o `applySessionToView` **repontar o global** pra sessão dele — então o
código bugado e o correto **concordam**, e o teste passa dos dois jeitos.

O bug só se manifesta quando um chat avança a FSM **enquanto outro está na tela**:
- o `trigger_intent` antigo avançava o `context.flowEngine` **global** (= o kernel do
  chat VISUALIZADO), não o do chat que fez a tool call;
- e o request de follow-up era montado do `context.flowState` **global** (= o estado do
  chat visualizado).

O teste final força exatamente isso: segura a resposta do chat #1, o teste navega pro
chat #2, e **só então** o `trigger_intent` é entregue. Assertions: (a) o follow-up do
chat #1 carrega o estado que **o kernel dele** avançou; (b) o kernel do chat #2 continua
no estado inicial.

**Validado contra o bug**: simulei o comportamento antigo (`getAgentSession` sempre
devolvendo a sessão do chat visualizado) e o teste **falhou na asserção certa**. Um teste
de regressão que não sabe falhar não vale nada — vale a pena repetir esse exercício.

### §5.2. O onboarding corre com os testes E2E

Em perfil novo, o app **auto-carrega o `.agent` de onboarding na thread que está na tela**
e o persiste como chat. Isso é uma **corrida** contra qualquer coisa que o teste faça
primeiro — e causou falha intermitente + contaminação entre testes do mesmo arquivo
(um teste passava sozinho e falhava no arquivo cheio).

**Solução:** tratar o onboarding como **pré-condição explícita** (esperar o painel
"Detalhes" + a linha "Bem-vindo ao Murici" na sidebar) e usá-lo como o "chat com agente"
conhecido, em vez de fingir que não existe. Ver `settleOnboarding()` no spec.

### §5.3. Como forçar um `trigger_intent` pelo stub

Emitir, no SSE:
`{type:"tool-input-available", toolCallId, toolName:"trigger_intent", input:{intent_name}, dynamic:true}`

O **`dynamic: true` é o que faz o SDK chamar o `onToolCall`** (`ai/dist/index.js`, case
`tool-input-available`). E o nome do intent dá pra **descobrir do próprio request**
(`body.behaviorState.validIntents`), sem hardcodar nada do fluxo do agente.

## §5.4. Achados da rodada com o servidor de modelo LIGADO

Os 5 specs que dependiam de um modelo local sempre **pulavam**. Com o servidor no ar eles
rodaram pela primeira vez e derrubaram dois bugs reais + uma lição sobre o próprio teste.

### Bug: duas linhas de chat sob o MESMO id (regressão do ADR-0007)

React: *"Encountered two children with the same key"* em `SidebarDataList`.

Desde o ADR-0007 a thread **nasce com o id final**, e passaram a existir **dois** criadores da
linha do chat para esse id: `ChannelController.send()` (primeira mensagem) e o auto-load do
onboarding (`right-sidebar`). Eles **correm**: o onboarding só chega lá depois de baixar +
desempacotar o `.agent` e carregar a FSM, então quem digita rápido chega antes. Os dois
chamavam `createChat()` e os dois davam prepend em `chats` → linha duplicada na sidebar,
chave duplicada no React, e o `name` do chat sendo sobrescrito.

Fix: [`lib/channels/chat-rows.ts`](../../lib/channels/chat-rows.ts) — `createChatRowOnce()`
(mapa de promises em voo por `threadId`: o segundo a chegar **aguarda a promise do primeiro**
em vez de criar) + `prependChatOnce()`. Os dois criadores passam por ele.

### Bug: `teach` chegava no modelo como NOME DE ARQUIVO (pré-existente, não era do ADR-0007)

Reportado ao vivo no `2. Fridge Assistant`: o modelo recebia `teach: "recipes.txt"` em vez do
conteúdo, e o agente perdia o catálogo de receitas. **Não** era do refactor de canais — ver
[§8](#8-o-unpack-do-agent-era-duplicado-corrigido).

### Lição: um teste que só é vermelho porque o modelo é ruim é pior que teste nenhum

O `verify-chat-isolation.spec.ts` (era da correção band-aid) nunca tinha rodado verde — ele
**pulava**. Ligado o servidor, ele ficou vermelho, mas **não pelo app**: um modelo quantizado
pequeno (Llama-3.2-1B) emite de forma confiável um tool call malformado
(`name: "unknown"`, `arguments` como **lista** JSON), e o próprio servidor do modelo devolve
**422** no turno seguinte. As asserções de isolamento passavam; o que quebrava era o guard de
`console.error` do fixture.

Foi **reescrito com stub** (o mesmo padrão do `channel-agent-isolation`), segurando a resposta
do chat A com uma promise em vez de um timer contra um modelo real. Mantém a cobertura que só
ele tinha — trocar para um chat **JÁ EXISTENTE** no meio do stream, que chega na thread
visualizada pelo **router**, e não por um id recém-cunhado.

> **Dívida real que isso expôs** (pré-existente, fora do escopo dos canais): um tool call
> malformado do modelo **envenena o histórico do chat** — a mensagem do assistant com
> `arguments` inválido fica no store e **todo turno seguinte daquele chat dá 422**. Não há
> saneamento. Vale um dia.

## §6. Estágio 3 — limpeza (PENDENTE)

- `flowEvents` por canal (hoje ainda é uma lista global, mas **tagueada** por
  `threadId` e filtrada na renderização, então já está correta — é higiene, não bug).
- Remover `abortController`/`setAbortController` do Context: **estado morto** — declarado
  em `context/context.tsx` e `global-state.tsx`, **nunca setado nem lido** (resíduo da era
  pré-SDK).
- Auditar `components/chat/chat-helpers/index.ts`: caminho legado que ainda passa
  `setIsGenerating`. O `right-sidebar` já não usa mais o `handleCreateChat` dele. A memória
  do projeto diz que é quase todo código morto — **confirmar e deletar** em vez de migrar.
- Destravar o [plano 014](../plans/014-channel-store-consumer-migration.md): migrar os
  consumidores para fora do espelho legado do `ChatbotUIContext`.

## §7. Dívida conhecida (aceita)

- **Invocations concorrentes numa MESMA thread** continuam não cabendo (o `useChat` é uma
  conversa com uma requisição em voo por vez). Afeta os observadores de sistema e o
  `@nome` multi-agente. O seam está no controller. Ver
  [plano 015](../plans/015-future-agent-topology.md).
- **Revival no estado inicial**: um agente reconstruído após reload do app volta ao estado
  INICIAL da FSM (só o bundle é persistido, não o estado vivo do kernel). Depende de
  **serialização de estado do kernel**, no backlog do dot-agent. Dentro de uma sessão isso
  não morde: o `KernelProxy` sobrevive no map, então trocar de chat e voltar preserva a
  posição do agente.
- **Tool call malformado envenena o chat** (pré-existente, ver §5.4): sem saneamento, todo
  turno seguinte daquele chat dá 422.

## §8. O unpack do `.agent` era duplicado (corrigido)

Fora do escopo dos canais, mas achado ao verificar: o usuário reportou que o
`2. Fridge Assistant` parou de listar receitas, e o `teach` chegava no modelo como
**`"recipes.txt"`** — o nome do arquivo, não o conteúdo.

**Não foi o refactor de canais.** Existiam **dois** montadores de `UnpackPayload`:

| Caminho | Onde | knowledge? |
|---|---|---|
| Navegador (file picker, onboarding) | `app/api/agent/unpack/route.ts` | sim ✅ |
| Electron (painel "Agentes", "abrir com", menu, launch) | `electron/main.ts` `resolveAgentFile` | **não** ❌ |

O do Electron nunca carregou `knowledge` nem `guides` — **desde que nasceu**. Sem knowledge,
o `resolveTeach` (`lib/runtime/advance-flow.ts`) não acha o arquivo e cai no fallback: devolve
o próprio nome. O motivo de só aparecer agora é irônico: o **fix do bug 1** (painel "Agentes")
destravou justamente o caminho que usa o `resolveAgentFile`.

**Por que o compilador não pegou:** `knowledge`/`guides`/`behaviors` eram **opcionais** no
`UnpackPayload`.

**Fix — unificação, não remendo.** Tornar os campos obrigatórios *não* resolveria: um
`knowledge: []` satisfaz o tipo e o bug volta calado. O main **não precisa** desempacotar nada
— a única coisa que só ele consegue fazer é **ler um path do disco**:

- `electron/main.ts`: `resolveAgentFile` → **`readAgentFile`**, que devolve só os **bytes**.
  Some junto o `getSDK()` e o hack `new Function("s", "return import(s)")` de ESM — o SDK sai
  do processo main.
- Os 4 entrypoints (`open-file`, argv de launch, menu "Load agent", painel "Agentes") passam a
  mandar o **path**, não o payload. O canal IPC `open-agent-file-error` morreu junto: o main
  não desempacota mais, então não tem mais no que falhar — o erro aparece onde o unpack mora.
- `lib/agents/unpack-agent-file.ts` vira **o** unpack: `unpackAgentFile(File)`,
  `unpackAgentFileFromUrl()`, `unpackAgentFileFromPath()` — os três pelo mesmo
  `/api/agent/unpack`.

**Guarda:** `__tests__/playwright-test/tests/agent-teach-resolution.spec.ts` carrega o
`.agent` real do Fridge e afirma que o `teach` que chega ao modelo é o **conteúdo**, não o
nome. Validado contra o bug simulado (fica vermelho na asserção certa).
