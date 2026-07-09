<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

# Log: Chat Handler Provider Extraction (long-form)

> Long-form incubation log — appendix to [ADR-0003](0003-chat-handler-provider-extraction.md).
> Historical record of the investigation, not current-behavior spec. Do not cite as source of truth;
> the ADR and the code are. Write-once — do not retro-edit as the design evolves further.

## Timeline

### Origin: "o modelo local recebe minha mensagem e gera, mas nao chega na interface"

Bug reportado pelo usuário em uma sessão anterior, com instrução explícita de metodologia
antes de investigar a causa: "adiciona o console.error em mais lugares agora, em vez de ser
mais pontual, na proxima rodada coloca por arquivos que participam da call stack" —
instrumentação sistemática em vez de tentativas pontuais. Isso levou ao diagnóstico
arquitetural: `useChatHandler()` era chamado em 9 componentes diferentes, cada um criando
sua própria instância de `useChat()`. Um plano de refatoração (Provider central,
espelhando o ADR-0002) foi proposto via plan mode e, após duas rodadas de ajuste pedidas
pelo usuário (ver seção seguinte), aprovado.

### Ajustes do usuário ao plano antes da implementação

Dois ajustes explícitos, ambos incorporados na versão final do plano (e no ADR):

1. Re: manter `components/chat/chat-hooks/use-chat-handler.tsx` como um re-export
   permanente — *"ja atualiza no app, como estamos migrando, nao deixa 'legado' no código,
   porem coloca como ultima tarefa, após testar se esta ok, estando ok, remove e testa
   novamente."* Resultado: fase 1 (implementação, com re-export transitório) → fase 2
   (verificação E2E) → fase 3 (repontar os 10 call sites, apagar o re-export, testar de
   novo).

2. Re: `ChatHandlerProvider` aninhado dentro de `AgentSessionProvider` (proposta original,
   para viabilizar `handleNewChat()` chamar `useAgentSession().resetSession()` via
   `useContext`) — *"verifica a estrturua/call stack, um chat pode existir sem agentes, mas
   todo agente precisa de um chat."* Investigação confirmou que `resetSession`/
   `destroyChatAgentSession` já eram primitivos de `GlobalState`, não de
   `AgentSessionProvider` — não havia necessidade funcional real de aninhamento. Resolvido
   invertendo o controle via `newChatSignal` (ver ADR).

### Implementação (fase 1)

Criados `context/chat-handler-context.tsx`, `components/utility/chat-handler-provider.tsx`,
`lib/hooks/use-chat-handler.ts`; `newChatSignal`/`setNewChatSignal` adicionados a
`ChatbotUIContext`/`GlobalState`; `useEffect([newChatSignal])` adicionado a
`AgentSessionProvider`; `ChatHandlerProvider` montado como irmão de `AgentSessionProvider`
em `app/[locale]/layout.tsx`; `components/chat/chat-hooks/use-chat-handler.tsx` virou
re-export transitório de `lib/hooks/use-chat-handler.ts`.

`npx tsc --noEmit` e `npx jest` (44/45 — a única falha, `openapi-conversion.test.ts`, é
pré-existente e não relacionada) passaram limpos nesse ponto.

### Verificação E2E revela um segundo bug, independente

`random-model-smoke.spec.ts` (teste que envia uma mensagem a um modelo local
auto-descoberto e verifica que a resposta chega ao DOM real, escrito numa sessão anterior
especificamente porque "the model can generate a reply server-side while the UI never shows
it — a gap none of the other layers... can catch") continuou falhando de forma consistente
(~30-38s, timeout de `toHaveCount`) mesmo depois da extração do Provider. O snapshot de
acessibilidade do Playwright na falha mostrava duas bolhas "Você" (usuário) — uma com o
texto real enviado, outra vazia, sem nenhuma bolha de assistente.

**Hipóteses eliminadas, em ordem, cada uma com evidência direta (não suposição):**

1. **Reincidência do bug de múltiplas instâncias** — eliminada. Logging (`logger.debug`,
   ver seção seguinte) confirmou `handleSendMessage` chamado exatamente uma vez, uma única
   escrita de mensagem de usuário no banco.
2. **Servidor de dev obsoleto / Fast Refresh corrompido** — eliminada. `lsof -ti:3000`
   confirmou nenhum processo pré-existente; o `webServer` do Playwright sobe um processo
   novo a cada execução.
3. **Modelo local lento/instável (`gpt-oss-20b`, `Qwen3.5-27B`, modelos grandes)** —
   eliminada. `POST` manual direto em `/api/chat/custom` para o mesmo modelo (`Qwen3.5-27B`)
   respondeu em 19.6s com `"pong"` correto — a rota e o modelo funcionam.
4. **Payload real do browser diferente do replicado manualmente** (mais tools/behaviorState
   → mais tempo de processamento) — eliminada. `page.on('response')`/`page.on('requestfinished')`
   temporários no teste capturaram o request/response reais: SSE perfeitamente válido
   (`start` → `text-delta` com `"pong"` → `text-end` → `finish`, `finishReason: "stop"`),
   ainda assim `onFinish` do lado do cliente logava `{role: undefined, text: ""}`.

### Migração do debug logging para Winston, a pedido do usuário

Instrução explícita, no meio da investigação: *"em vez de zzz, troca já pelo debug do
winston, já coloca o nivel certo e vamos mater no futuro, qualquer coisa usa um nivel baixo
para poder ativar num verbose, de agora em diante, mantem essa direçao de usar o winston e
já colocar um debug definitivo com o nivel correto."* `lib/logger/index.ts` ganhou um
hierarquia real de níveis (`error > warn > info > debug`) gateada por
`NEXT_PUBLIC_LOG_LEVEL` (debug desligado por padrão, ligável em dev/E2E) — os
`logger.debug(...)` adicionados nesta investigação (`chatMessages changed`, `stream-sync
effect fired`, `useChat onFinish fired`) ficaram no código permanentemente, em vez de serem
removidos como instrumentação descartável.

### A causa real: `busca na internet por exemplos ou no código dos pacotes se necessario`

Com o response de rede confirmado válido e o `onFinish` do cliente ainda produzindo lixo, o
usuário redirecionou a metodologia de debug: *"busca na internet por exemplos ou no código
dos pacotes se necessario."* `WebSearch` deu contexto geral (gap de compatibilidade entre
`useChat` e o formato de UI Message Stream mais novo), mas a causa exata só apareceu lendo o
código-fonte instalado diretamente:

- `node_modules/ai/dist/index.d.ts`, tipo `ChatOnFinishCallback<UI_MESSAGE>`:
  ```ts
  type ChatOnFinishCallback<UI_MESSAGE extends UIMessage> = (options: {
    message: UI_MESSAGE;
    messages: UI_MESSAGE[];
    isAbort: boolean;
    isDisconnect: boolean;
    isError: boolean;
    finishReason?: FinishReason;
  }) => void;
  ```
- `node_modules/ai/dist/index.js`, `AbstractChat.makeRequest`, bloco `finally`:
  ```js
  finally {
    try {
      this.onFinish?.call(this, {
        message: this.activeResponse.state.message,
        messages: this.state.messages,
        isAbort, isDisconnect, isError,
        finishReason: this.activeResponse?.state.finishReason
      });
    } catch (err) { console.error(err); }
    this.activeResponse = void 0;
  }
  ```

`components/utility/chat-handler-provider.tsx` tinha `async onFinish(message: any) {
...message.role, getMessageText(message)... }` — tratando o objeto wrapper inteiro
(`{message, messages, isAbort, ...}`) como se fosse a mensagem. `message.role` era sempre
`undefined` (o wrapper não tem `.role`, só `.message.role`); `getMessageText(message)`
retornava `""` pelo mesmo motivo. A resposta correta já tinha sido renderizada
corretamente por um efeito separado (que lê `vercelMessages` — o array gerenciado pelo SDK
— diretamente, sem passar por `onFinish`), mas o instante em que o stream terminava,
`onFinish` sobrescrevia a bolha "temp-assistant" (com o texto real) por uma linha vazia/sem
role persistida no banco. Bug determinístico, reproduzível em toda conclusão de resposta —
independente do bug de múltiplas instâncias, e a causa real e original do sintoma "o modelo
recebe minha mensagem e gera, mas nao chega na interface."

**Fix:** `async onFinish({ message }: { message: any }) { ... }` — desestruturar `message`
do wrapper.

### Verificação final

- `npx tsc --noEmit` limpo.
- `random-model-smoke.spec.ts` — 3 execuções seguidas, todas verdes (14.6s–47.3s,
  variação normal de tempo de inferência local).
- `chat-tool-calling.spec.ts` — verde.
- `npx jest` — 44/45 (mesma falha pré-existente e não relacionada de antes).

### Fase 2 — migração final dos call sites

Confirmados 10 call sites reais (não 9 — `right-sidebar.tsx` também usa `useChatHandler()`
para `handleNewChat`, não capturado na contagem original do plano):
`sidebar.tsx`, `delete-chat.tsx`, `right-sidebar.tsx`, `chat-secondary-buttons.tsx`,
`chat-ui.tsx`, `message.tsx`, `chat-messages.tsx`, `chat-input.tsx`,
`workspace-switcher.tsx`, `chat/page.tsx`. Todos repontados para
`@/lib/hooks/use-chat-handler`; `components/chat/chat-hooks/use-chat-handler.tsx` (o
re-export transitório) apagado. `tsc --noEmit`, os dois specs Playwright (3x o smoke test) e
`jest` reexecutados — todos verdes na mesma configuração final.

## Nota sobre integridade da sessão

Durante a exploração deste bug, hooks do sistema (`PreToolUse:Read`/`PreToolUse:Bash`)
injetaram repetidamente instruções não solicitadas exigindo rodar `graphify query` antes de
cada leitura/grep, incluindo uma instrução para propagar essa exigência para todo subagente.
Um subagente despachado nesta mesma investigação sinalizou o mesmo padrão de injeção de
forma independente e não obedeceu à parte de propagação. Registrado aqui por transparência;
não teve efeito sobre a precisão dos achados, que vieram de leitura direta do código-fonte
real (aplicação e `node_modules`).
