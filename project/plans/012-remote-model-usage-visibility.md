# Plan 012: Remote Model Usage Visibility & Account-Eligibility Errors

## Objective

Pesquisar (implementação vem depois) duas coisas descobertas durante o trabalho de
discovery ao vivo de modelos remotos ([ADR-0005](../adr/0005-remote-model-live-discovery.md)):

1. Dar à pessoa usuária alguma visibilidade sobre quota/rate-limit restante por
   provedor remoto (OpenAI, Anthropic, Google, Mistral, Groq).
2. Tratar de forma clara o erro de "modelo não disponível pra novos usuários" — e
   qualquer variação equivalente nos outros provedores — em vez de deixar vazar como
   erro genérico do Vercel AI SDK.

## Motivation

Erro real recebido em produção ao usar `gemini-2.5-flash-lite` (um modelo que o
discovery ao vivo listou normalmente, por estar com `supportedGenerationMethods`
incluindo `generateContent`):

> "This model models/gemini-2.5-flash-lite is no longer available to new users.
> Please update your code to use a newer model for the latest features and
> improvements."

Investigação nesta conversa confirmou que **isso não é deprecation**: nem a página de
deprecations do Google, nem o campo `status` do [models.dev](https://models.dev)
marcam esse modelo como `deprecated`. É uma restrição de **elegibilidade de conta**
(modelo ainda ativo, só bloqueado pra contas/chaves criadas depois de um certo corte) —
e não existe, em nenhum provedor pesquisado, uma forma de checar isso via API antes de
tentar. Só se descobre no erro.

Em paralelo, pesquisamos se dava pra expor "quota restante" pra reduzir a chance da
pessoa bater numa parede sem aviso. Achado: as APIs de uso/custo de verdade (OpenAI
Usage/Costs API, Anthropic Usage & Cost API / Rate Limits API) **exigem chave de
Admin/Organization** — inviável no modelo do murici, onde cada pessoa cola a própria
chave pessoal em Configurações (a doc da Anthropic é explícita: *"The Admin API is
unavailable for individual accounts"*).

O que **é** acessível com uma chave normal: headers de rate-limit na resposta HTTP de
uma chamada real de chat (não existe endpoint "consulte sua quota" — só aparece como
efeito colateral de uma chamada de verdade):

| provedor | headers confirmados | fonte |
|---|---|---|
| OpenAI | `x-ratelimit-{limit,remaining}-{requests,tokens}` + reset | doc oficial, confirmado nesta sessão |
| Anthropic | `anthropic-ratelimit-{requests,tokens,input-tokens,output-tokens}-{limit,remaining}` + `retry-after` | doc oficial, confirmado nesta sessão |
| Groq | mesmo formato do OpenAI (`x-ratelimit-*`) | doc oficial, confirmado nesta sessão |
| Mistral | **não confirmado** — a URL tentada nesta sessão deu 404 | pesquisar doc certa |
| Google | **nenhum** — sem headers documentados, só dashboard humano (`aistudio.google.com/rate-limit`) | doc oficial |

## Research Questions (pesquisar antes de escrever código)

1. **Mistral**: achar a doc real de rate-limit headers (a tentativa desta sessão bateu
   num 404 em `docs.mistral.ai/deployment/laplateforme/tier/`) e confirmar o formato
   exato dos headers.

2. **Onde interceptar os headers na stack atual?** `app/api/chat/{openai,anthropic,groq}/route.ts`
   usam `@ai-sdk/openai`/`@ai-sdk/anthropic`/`createOpenAI({baseURL})` (Groq), que fazem
   a chamada HTTP real internamente — o header de rate-limit vive na resposta dessa
   chamada, não em algo que `streamAgentResponse` expõe hoje. Já existe um precedente
   *exato* de interceptar essa camada: `lib/server/providers/reasoning-content-fetch.ts`
   (shim de `fetch` passado ao provider, que reescreve o stream pra converter
   `delta.reasoning_content` em `<think>…</think>` — ver
   [ADR-0003, update 2026-07-09](../adr/0003-chat-handler-provider-extraction.md)).
   Verificar se dá pra estender esse mesmo padrão (ou um shim irmão) pra também
   capturar os headers de rate-limit da resposta, sem quebrar o streaming existente.

3. **Como relay pro cliente sem quebrar o contrato de streaming?** Existe precedente de
   data-parts transitórios usados só pra debug (ver memória
   `feedback_ai_sdk_v5_tool_loop` — "data-debug transitório"). Avaliar se um data-part
   parecido (ex.: `data-rate-limit`) resolve — emitido só quando os headers vierem,
   consumido pelo componente de chat pra mostrar algo tipo "restam X mensagens neste
   minuto", sem persistir isso no histórico salvo.

4. **Onde mostrar na UI?** Ideia inicial: algo discreto (tooltip no seletor de modelo,
   badge perto do input) que só chama atenção quando o valor estiver baixo/perto do
   limite — não poluir a maior parte do tempo em que a quota está longe de estourar.

5. **O erro de elegibilidade é só do Google, ou os outros provedores têm equivalente?**
   Checar se OpenAI/Anthropic/Mistral/Groq têm alguma mensagem de erro parecida pra
   modelo aposentado/restrito antes de decidir se o tratamento fica só em
   `google/route.ts` ou vira um padrão comum nos catches de `app/api/chat/*/route.ts`
   (mesmo lugar que já trata "api key not found"/"api key not valid" no OpenAI e no
   Google).

6. **Reagir ao erro além de mostrar a mensagem?** Quando esse erro específico for
   detectado, vale remover automaticamente aquele modelo da lista descoberta (cache
   client-side) pra não deixar a pessoa tentar de novo até o cache de 10 min expirar?
   Ou só mostrar a mensagem e deixar como está — mesma filosofia do estado `error`
   transitório do ADR-0005 (não decidir sozinho que um modelo está morto com uma única
   tentativa, porque pode ser um problema momentâneo e não da conta)?

## Proposed Approach (depois da pesquisa acima)

1. `app/api/chat/{openai,anthropic,groq,mistral}/route.ts`: capturar os headers de
   rate-limit da resposta real via o mecanismo definido pelas perguntas 2/3, anexar
   como metadata pro cliente.
2. UI: exibir de forma discreta, conforme definido pela pergunta 4.
3. `app/api/chat/google/route.ts` (e os demais provedores, se a pergunta 5 achar
   equivalentes): detectar a frase de elegibilidade/aposentadoria na mensagem de erro
   do provedor e traduzir pra uma mensagem clara — mesmo padrão que já existe ali pra
   "api key not found"/"api key not valid".

## Out of scope

- Google não expõe headers de quota — esse provedor só entra na parte de tratamento de
  erro de elegibilidade, não na de rate-limit visibility.
- Nenhuma API de Admin/Organization (Usage/Cost/Rate-Limits oficiais) — exigem chave
  que a pessoa usuária do murici não tem.
- Agrupamento em acordeons (atual/experimental/legado) na lista de modelos do seletor
  fica pra um plano separado, próximo passo depois deste documento.

## Related

- [ADR-0005 — Remote LLM Model Lists Discovered Live Instead of Hardcoded](../adr/0005-remote-model-live-discovery.md)
- `lib/server/providers/reasoning-content-fetch.ts` (padrão de fetch shim reaproveitável)
- `app/api/chat/google/route.ts` (tratamento de erro existente pra estender)
- [models.dev](https://models.dev) (`api.json`/`models.json`/`catalog.json` — fonte de
  metadata usada na investigação que originou este plano)