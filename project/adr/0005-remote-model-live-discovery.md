<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

# ADR-0005: Remote LLM Model Lists Discovered Live Instead of Hardcoded

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-11 |
| Deciders | Danilo Borges |
| Supersedes | — |
| Superseded by | — |
| Last revised | — |

---

## Context

Bug reportado ao vivo: agentes remotos quebrando com 404 do Google —
`"models/gemini-1.5-flash is not found for API version v1beta, or is not supported for
generateContent"` — seguido de um `NoOutputGeneratedError` genérico do Vercel AI SDK
mascarando a causa real. Modelos locais continuavam funcionando normalmente.

Investigação (`lib/models/fetch-models.ts`, `lib/models/llm/*-llm-list.ts`) achou a causa
raiz estrutural: a lista de modelos de cada provedor remoto (OpenAI, Google, Anthropic,
Mistral, Groq) era **hardcoded** em arrays estáticos (`OPENAI_LLM_LIST`, `GOOGLE_LLM_LIST`
etc.), congelados desde 2023/2024 e nunca atualizados. `fetchHostedModels()` simplesmente
empilhava `LLM_LIST_MAP[provider]` sem nenhuma chamada de rede ao provedor — em contraste
com `fetchLocalModels()` (via `/api/models/discover`) e `fetchOpenRouterModels()`, que já
faziam discovery ao vivo. Assim que um provedor descontinua um modelo (Google já removeu
toda a família `gemini-1.5-*`/`gemini-pro*`; OpenAI já aposentou `gpt-4-turbo-preview` e
`gpt-4-vision-preview`), o app continuava oferecendo esse id no seletor e a primeira
mensagem enviada quebrava.

Um segundo problema, descoberto só ao rastrear o caminho completo do modelo selecionado até
o envio da mensagem: vários componentes (`ChatHandlerProvider`, `ChatInput`,
`useSelectFileHandler`, `Message`) resolviam detalhes do modelo (provider pra roteamento,
suporte a imagem, ícone/nome) fazendo `LLM_LIST.find(...)` **de forma síncrona e só contra
o array estático**. Se a correção só trocasse a fonte dos modelos oferecidos no seletor sem
tocar esses lookups, um modelo Gemini/GPT descoberto ao vivo apareceria como selecionável,
mas `ChatHandlerProvider` não o encontraria em `LLM_LIST`, cairia no fallback
`currentProvider = "custom"` e roteraria a mensagem pro endpoint errado
(`app/api/chat/custom`), quebrando de um jeito novo e mais confuso que o bug original.

## Decision

1. **Nova rota `app/api/models/discover-remote/route.ts`** (edge, `POST`), que recebe
   `{ apiKeys: {...} }` no mesmo formato que `app/api/chat/*/route.ts` já usa
   (`getProfileFromBody`/`buildApiKeys`, com fallback pra env vars via `VALID_ENV_KEYS`), e
   dispara em paralelo (`Promise.allSettled`, timeout de 5s por `AbortController`, mesmo
   padrão de `app/api/models/discover/route.ts`) uma chamada REST de list-models pra cada
   provedor com chave presente:
   - OpenAI `GET /v1/models`, Groq `GET /v1/openai/v1/models` (mesmo formato,
     `Authorization: Bearer`)
   - Anthropic `GET /v1/models` (`x-api-key` + `anthropic-version`)
   - Google `GET /v1beta/models?key=...`, filtrado a
     `supportedGenerationMethods.includes("generateContent")` (sem isso a lista vem dominada
     por modelos de embedding)
   - Mistral `GET /v1/models`, com filtro simples excluindo ids de embedding

   Resposta por provedor: `{ status: "ok", models }` | `{ status: "auth_error" }` |
   `{ status: "error" }`, cacheada em memória (`Map` module-level, TTL 10 min, chave
   `provider:apiKey`) — processo Node de vida longa embutido no Electron, não serverless,
   então o cache persiste de verdade entre requests.

2. **`fetchHostedModels()` (`lib/models/fetch-models.ts`)** reescrita: Perplexity (sem
   endpoint público de list-models) e Azure (deployments configurados manualmente, não
   modelos descobertos) continuam vindo da lista estática; os outros cinco provedores vêm
   de uma única chamada a `discover-remote`. Por resultado:
   - `ok` → modelos entram na lista normalmente.
   - `auth_error` (chave rejeitada pelo provedor) → `toast.error`, provedor sem modelos.
   - `error` (rede/timeout/5xx/429 — falha transitória com chave aparentemente válida) →
     injeta uma entrada sentinel `disabled: true` no grupo daquele provedor, renderizada em
     `components/models/model-select.tsx` como uma linha "Could not load models" não
     clicável, em vez de reintroduzir silenciosamente a lista estática morta (o mesmo bug
     que estamos corrigindo).

3. **Consumidores síncronos de `LLM_LIST`** (`chat-handler-provider.tsx` — crítico, decide
   `currentProvider` pra roteamento —, `chat-input.tsx`, `use-select-file-handler.tsx`,
   `message.tsx`) passaram a consultar `[...LLM_LIST, ...availableHostedModels]` em vez de só
   `LLM_LIST`. `LLM_LIST` (o array estático agregado) não foi apagado: continua alimentando
   esses lookups como registro histórico, pra mensagens antigas que referenciam um modelo já
   descontinuado ainda resolverem nome/ícone — só não é mais a fonte do que aparece como
   selecionável no dropdown (isso agora vem de `availableHostedModels`, populado pelo
   discovery ao vivo).

4. **`profile-settings.tsx`** tinha uma reimplementação manual da mesma lógica de
   provider/key/model-list de `fetchHostedModels` (iterava providers, resolvia
   `providerKey`, olhava `LLM_LIST_MAP[provider]` na mão) rodando no save do perfil. Trocado
   por uma chamada direta a `fetchHostedModels(updatedProfile)` — uma fonte de verdade só,
   compartilhada com o load inicial em `global-state.tsx`.

5. **`global-state.tsx`**: default de `chatSettings.model` trocado de `"gpt-4-turbo-preview"`
   (morto) pra `"gpt-4o-mini"`; e, após o discovery resolver no mount, se o modelo salvo em
   `localStorage` (de uma sessão anterior) não existir em nenhuma lista disponível
   (hosted/local/openrouter), cai pro primeiro modelo disponível em vez de manter
   silenciosamente um id morto até o primeiro envio falhar.

**Descoberta não-óbvia durante a implementação:** ao testar o caminho de chave inválida
contra as APIs reais, quatro provedores (OpenAI, Anthropic, Mistral, Groq) devolvem HTTP 401
pra chave inválida — mas o **Google devolve HTTP 400** (`status: "INVALID_ARGUMENT"`, com
`reason: "API_KEY_INVALID"` nos `error.details`), não 401/403. Uma checagem genérica
"401/403 = auth_error" classificaria toda chave Google inválida como falha transitória
(mostrando o placeholder "não foi possível carregar" em vez do toast de erro esperado). A
detecção de `auth_error` do Google (`discoverGoogle` em `discover-remote/route.ts`) por isso
inspeciona o corpo do erro (`error.details[].reason === "API_KEY_INVALID"`), não só o status
HTTP.

## Options considered

- **Cair pra lista estática antiga quando o discovery ao vivo falhar** — rejeitada
  explicitamente: reintroduziria o exato bug que estamos corrigindo (modelo já descontinuado
  aparecendo como selecionável) toda vez que a chamada de discovery desse erro transitório.
  Preferida a alternativa de placeholder não-selecionável + nenhum fallback pra dado
  potencialmente morto.
- **Endpoint separado por provedor** (`/api/models/discover-remote/openai`, `/google`, etc.)
  — mais RESTful, mas exigiria N round-trips do cliente e duplicaria a lógica de
  cache/timeout por arquivo. Rejeitada em favor de um único endpoint com fan-out interno,
  espelhando o padrão já validado em `app/api/models/discover/route.ts` (local).
  Adiciona um `disabled?: boolean` opcional em `LLM` — sem impacto nos literais de `LLMID`
  existentes, esses continuam válidos como `LLMID | string`.

## Consequences

**Fica mais fácil:**
- Modelos remotos ficam sempre atuais (refletem o catálogo real do provedor no momento do
  request), sem depender de um dev lembrar de atualizar um array hardcoded a cada
  deprecation.
- Falha de chave inválida e falha de rede/timeout agora produzem sinais visualmente
  diferentes pro usuário (toast vs placeholder), em vez de ambos silenciosamente não
  aparecerem ou aparecerem como se fossem modelos válidos.
- Uma única função (`fetchHostedModels`) resolve o conjunto de modelos hospedados
  disponíveis, chamada tanto no load inicial (`global-state.tsx`) quanto no save do perfil
  (`profile-settings.tsx`) — a duplicação de lógica entre os dois pontos foi eliminada.

**Fica mais difícil / custos aceitos:**
- O dropdown de modelos agora depende de uma chamada de rede bem-sucedida pra popular
  openai/anthropic/google/mistral/groq (antes era síncrono/instantâneo, só array estático).
  Mitigado pelo cache de 10 min e pelo fato de local/custom continuarem instantâneos.
- Cache de 10 min em memória significa que, por até esse tempo, um modelo que acabou de ser
  descontinuado pelo provedor ainda pode aparecer como selecionável (janela pequena, aceita
  como troca razoável por não bater na API do provedor a cada abertura do seletor).
- Perplexity permanece com lista estática curada (sem endpoint público de list-models) —
  ainda sujeita a ficar desatualizada com o tempo, mesma classe de bug que motivou este ADR,
  só que sem solução de discovery disponível hoje.
- `LLM_LIST` (estático) continua existindo só pra lookup histórico — mais um lugar pra saber
  que existe ao entender o fluxo de resolução de modelo, documentado no comentário de
  `lib/models/llm/llm-list.ts`.

## Related

- `app/api/models/discover-remote/route.ts` (nova rota)
- `app/api/models/discover/route.ts` (padrão de fan-out/timeout reaproveitado, discovery local)
- `lib/models/fetch-models.ts` (`fetchHostedModels` reescrita)
- `lib/models/build-api-keys.ts` (`buildApiKeys`, reaproveitado sem alteração)
- `lib/server/server-chat-helpers.ts` (`getProfileFromBody`, reaproveitado sem alteração)
- `lib/models/llm/llm-list.ts` (`LLM_LIST`/`LLM_LIST_MAP`, comentário adicionado)
- `types/llms.ts` (`LLM.disabled?`)
- `components/models/model-select.tsx` (placeholder não-selecionável)
- `components/utility/chat-handler-provider.tsx`, `components/chat/chat-input.tsx`,
  `components/chat/chat-hooks/use-select-file-handler.tsx`, `components/messages/message.tsx`
  (lookups de `LLM_LIST` estendidos pra `availableHostedModels`)
- `components/utility/profile-settings.tsx`, `components/utility/global-state.tsx`
