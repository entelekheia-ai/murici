# Estudo: extrair o autodiscovery (local + remoto) para um pacote próprio

> Documento de pesquisa, não um plano de implementação aprovado. Nada aqui foi
> codificado em `murici` ainda. Objetivo: decidir se/como extrair a lógica de
> `app/api/models/discover(-remote)/route.ts` + `lib/models/fetch-models.ts` +
> os hooks/estado de `model-select.tsx` para um pacote reutilizável, com
> entry points separados (local, server, react) e boas práticas vanilla/TS/React.

## TL;DR (recomendação)

- **Pacote**: `packages/autodiscovery/` dentro do próprio repo `murici`, consumido
  via **`file:` symlink** — o mesmo padrão já validado neste repo pro consumo do
  `dot-agent-spec` ([[project_murici_dot_agent_sync]]). Sem introduzir npm
  workspaces do zero; publicar no registry fica como passo 2, depois que a API
  estabilizar (a estrutura abaixo já deixa isso barato — é só `npm publish`,
  não um redesenho).
- **Entry points** via `package.json` `exports` map (padrão confirmado no SDK do
  próprio models.dev, ver abaixo): `.` (core puro), `./server`, `./local`,
  `./react`. Sem MVC/MVVM formal — arquitetura de **core puro + adapters finos**
  por ambiente/framework (ver seção dedicada).
- **WASM: não vale a pena** para a lógica atual (classificação é string/array ops
  baratas, não há gargalo de CPU). Só reconsiderar se um dia precisarem
  reusar a mesma lógica de um host não-JS do próprio ecossistema (aí a resposta
  natural é reescrever o core em Rust + `wasm-bindgen`, no mesmo padrão já usado
  em `wasi-stub`/`kernel-dsl`, não compilar o TS existente).
- **Maior risco real de integração, não teórico**: o `electron/*.ts` (processo
  main) compila pra CommonJS (`tsconfig.electron.json`: `"module": "commonjs"`).
  Se o pacote for ESM-only (como o SDK do models.dev), ele não pode ser
  `require()`'d dali. Na prática isso não deve importar — a lógica de discovery
  vive nas rotas Next (`app/api/models/*`), que são bundladas pelo Next/webpack
  e não têm esse problema — mas é uma checagem explícita a fazer na
  implementação, não uma suposição.

## O que existe hoje em `murici` (o que está sendo extraído)

| Arquivo | Responsabilidade | Vira |
|---|---|---|
| `app/api/models/discover-remote/route.ts` | fetch por provedor (OpenAI/Anthropic/Google/Mistral/Groq), cache 10min, models.dev (72h + stale fallback), `classifyModels` (current/experimental/legacy) | `core` (classificação pura) + `server` (a rota em si, adapter Next) |
| `app/api/models/discover/route.ts` | probe de Ollama/LM Studio local, fan-out paralelo com timeout | `local` (roda em qualquer host com rede local, sem segredo nenhum) |
| `lib/models/fetch-models.ts` (`fetchHostedModels`) | chama a rota, decide toast vs placeholder, monta `LLM[]` final | metade fica no `server`/`core` (contrato `ok/auth_error/error`), metade (toast, placeholder) é decisão de UI e fica em `react` |
| `components/models/model-select.tsx` (accordion, tiers, busca) | puramente apresentação — fica em `murici`, mas passa a consumir o hook em vez de `ChatbotUIContext.availableHostedModels` populado imperativamente |

## O que o SDK do models.dev ensina (clonado e lido em
`/private/tmp/.../scratchpad/models-dev-study/models.dev/packages/sdk`)

Nome real do pacote publicado: **`@opencode-ai/models`** (não é literalmente
`models.dev` no npm — importante na hora de instalar).

Padrões que valem a pena copiar:

1. **Multi-entry via `package.json` `exports`**, um `dist/*.js` por entrada:
   ```json
   "exports": {
     ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
     "./effect": { "types": "./dist/effect.d.ts", "default": "./dist/effect.js" },
     "./snapshot": { "types": "./dist/snapshot.d.ts", "default": "./dist/snapshot.js" }
   }
   ```
   Isso é exatamente o mecanismo pra ter `@murici/autodiscovery`,
   `@murici/autodiscovery/server`, `@murici/autodiscovery/local`,
   `@murici/autodiscovery/react` sem 4 pacotes npm separados.

2. **Cliente deliberadamente sem cache** (`client.ts`): "*Every method performs
   exactly one GET and nothing is ever cached — callers who want caching
   should wrap calls with their own policy.*" Isso valida uma decisão de
   arquitetura pro nosso core: a função de classificação/fetch por provedor
   deve ser **stateless**; quem cacheia (10min por provedor, 72h pro catálogo
   models.dev) é a camada `server` — exatamente como já está estruturado em
   `discover-remote/route.ts` hoje, então a extração não muda essa decisão, só
   move o código.

3. **Entry point opcional pra um ecossistema específico** (`./effect`, atrás de
   `peerDependenciesMeta.effect.optional: true`) é o precedente direto pro
   nosso `./react`: React fica como **peer dependency opcional**, o core não
   depende de React em nada, só o entry `./react` importa `react` (e falha
   claramente se ausente).

4. **`./snapshot`**: um JSON do catálogo congelado no build, pra uso sem rede
   nenhuma. Não é uma prioridade agora (nosso caso sempre tem rede — é uma
   API local do usuário), mas é uma opção barata a considerar como **fallback
   final abaixo do stale-cache de 72h**: se o processo nunca conseguiu buscar
   models.dev nem uma vez (primeira execução, rede indisponível), cair num
   snapshot embutido no pacote em vez de `null` puro. Vale mencionar como
   melhoria futura, não bloqueia a extração inicial.

5. **Erro único com `reason` discriminante** (`ModelsDevError`), não uma
   hierarquia de subclasses — mais simples de tratar num `switch`. Vale copiar
   pro nosso core em vez do `ProviderResult` atual ser só `status` sem uma
   classe de erro dedicada (hoje já é essencialmente isso, só formalizar).

6. **Build**: ESM puro (`"type": "module"`), `Node >= 18`, `module: NodeNext`,
   compilado só com `tsc` (sem bundler/esbuild) + um script que copia o
   snapshot gerado (`tsc` não processa `.js` gerado por outro script). Simples
   de replicar, mas é ESM-only — ver risco do Electron main acima.

## Arquitetura proposta

```
packages/autodiscovery/
  src/
    core/
      classify.ts        # baseName, googleBaseId, classifyModels — puro, sem fetch
      models-dev.ts       # getModelsDevCatalog (cache 72h + stale fallback)
      types.ts            # ProviderResult, DiscoveredModel (~ hoje LLM, mas sem os campos de UI tipo pricing)
      errors.ts           # 1 classe, reason discriminante (como o SDK do models.dev)
    providers/
      openai.ts anthropic.ts google.ts mistral.ts groq.ts   # um fetch cru por provedor, chama core/classify
    local/
      index.ts            # probeOllama/probeOpenAICompat local — sem segredo, roda em qualquer host
    server/
      index.ts            # createDiscoveryHandler({ getApiKeys }) — adapter fino p/ Next/Express/etc, orquestra providers/* + cache 10min por provider+key
    react/
      useHostedModels.ts   # hook: chama o endpoint server, expõe { models, isLoading, error } já particionado por tier
      useLocalModels.ts
    index.ts               # reexporta só o core (tipos + classify), sem side effects
  package.json              # exports map: ".", "./server", "./local", "./react"
  tsconfig.json
```

- **`core`** não sabe o que é Next.js, Electron, ou React. Só recebe uma lista
  crua de `{id, createdAt?, active?}` por provedor + o catálogo já baixado do
  models.dev, e devolve `DiscoveredModel[]` com `tier`. Testável sem rede
  nenhuma (é exatamente o que os testes ao vivo desta sessão validaram —
  Google `baseModelId` ausente na prática, cascata indevida de `deprecated`,
  duplicatas do Mistral — todos esses viram fixtures de teste unitário no
  `core`, em vez de precisarem de chave real toda vez).
- **`providers/*`** sabe fazer a chamada HTTP e o parsing específico de cada
  API (headers, forma da resposta), mas delega toda decisão de tier pro core.
- **`server`** é o único lugar que lida com segredo (API key) e cache por
  request. `createDiscoveryHandler` recebe uma função `getApiKeys(req) => {...}`
  fornecida por quem consome (murici passa `getProfileFromBody` adaptado) —
  o pacote não conhece o formato de `ServerProfile` do murici.
- **`local`** roda em qualquer processo com acesso à rede local (Ollama em
  `localhost:11434`) — não precisa de segredo, então pode em teoria rodar até
  do lado do cliente/browser sem problema de expor chave.
- **`react`** depende de `react` como peer opcional; o hook decide loading/
  erro/toast-vs-placeholder (hoje isso está espalhado entre
  `fetch-models.ts` e `model-select.tsx` — centralizaria num lugar só).

## MVC / MVVM — vale a pena pensar nesses termos?

Não muito bem, e não recomendo forçar. MVC/MVVM são padrões de **camadas de
UI com estado mutável observável**; isso aqui é uma **biblioteca de dados
sem estado próprio** (o SDK do models.dev reforça isso: "nothing is ever
cached" no core). O que se aplica de fato é **arquitetura hexagonal / ports &
adapters**: `core` é o domínio puro, `providers/server/local/react` são
adapters de I/O. Dito isso, se ajudar a comunicar a ideia em termos que o
resto do time já usa:

- o hook React (`useHostedModels`) É, na prática, um **ViewModel fino** — expõe
  estado derivado (`{models, isLoading, error}`) pronto pro `model-select.tsx`
  (a View) consumir sem lógica própria. Não precisa chamar isso de "MVVM"
  formalmente, mas a analogia é honesta.
- se um dia quiserem um entry point Vue/Svelte, o mesmo core serve — Vue vira
  um composable (`useHostedModels.ts` quase idêntico, troca `useState`/`useEffect`
  por `ref`/`watchEffect`), Svelte vira uma store. Nenhum dos dois exige tocar
  no `core`.

## WASM — vale a pena?

**Não para o que existe hoje.** Dois motivos:

1. **Não há trabalho de CPU pesado.** `classifyModels` é filter/map/regex sobre
   no máximo ~100-200 itens (visto ao vivo: OpenAI devolveu 117 modelos brutos,
   o maior caso real testado). WASM ajuda quando há loop apertado/numérico
   (parsing binário, criptografia, simulação); aqui o gargalo é rede (fetch),
   não CPU, e WASM não acelera fetch.
2. **TS não compila pra WASM pelo toolchain padrão.** As opções reais seriam:
   - **AssemblyScript**: subconjunto de TS, precisaria reescrever
     `classifyModels` numa linguagem-primo restrita (sem `Map`/`Set` completos,
     sem regex nativo confiável) — custo alto pra zero ganho de performance.
   - **Embutir um engine JS dentro de WASM** (Javy, QuickJS-wasm): roda JS de
     verdade dentro de WASM, mas carrega um runtime JS inteiro só pra executar
     uma função de 40 linhas — no navegador isso é *mais* peso, não menos.
   - **Reescrever o core em Rust + `wasm-bindgen`**: única opção que faz
     sentido, e só se o motivo for **interoperabilidade com outro host não-JS
     do próprio ecossistema** (o `dot-agent`/`kernel-dsl` já usa Rust +
     wasi-stub — se um dia uma ferramenta Rust do ecossistema precisar da MESMA
     classificação current/experimental/legacy, ali sim WASM ganha sentido,
     igual ao propósito do `wasi-stub` hoje). Não é uma necessidade hoje.
3. **Web Worker ≠ WASM.** Se a preocupação for "rodar isso fora da main thread
   no browser", isso é só um Web Worker rodando JS/TS normal — nenhuma
   compilação especial necessária, e nem chega a valer a pena aqui (parsing de
   um JSON de ~200 itens é da ordem de 1-2ms, não trava a UI).

Recomendação: **não investir em WASM agora**; documentar essa análise pra não
reabrir a discussão do zero se a pergunta voltar, e revisitar só se (a)
aparecer trabalho genuinamente pesado (ex.: fuzzy-matching por embeddings pra
achar duplicatas entre provedores) ou (b) um consumidor não-JS real aparecer.

## Impacto concreto em `murici`

- `app/api/models/discover-remote/route.ts` encolhe pra ~15 linhas: resolve
  `apiKeys` do jeito que já faz hoje (`getProfileFromBody`), chama
  `createDiscoveryHandler(...).handle(apiKeys)` do pacote, devolve o JSON. A
  responsabilidade de cache/classificação sai do murici.
- `app/api/models/discover/route.ts` (local) vira um wrapper equivalente sobre
  `@murici/autodiscovery/local`.
- `lib/models/fetch-models.ts` **deixa de existir como está** — vira
  `useHostedModels()`/`useLocalModels()` de `@murici/autodiscovery/react`.
  Ponto real de fricção a resolver na implementação (não resolvido aqui): hoje
  `availableHostedModels` é estado **imperativo no `ChatbotUIContext`**,
  populado por um `useEffect` em `global-state.tsx` e outro em
  `profile-settings.tsx`. Um hook React idiomático quer ser chamado direto
  onde é usado, não empurrado pra um Context global por fora. Duas opções pra
  decidir na implementação, não agora:
  1. Contexto continua sendo a fonte da verdade; ele internamente usa o hook
     e expõe o resultado (muda o *onde* mas não o *quê*).
  2. Migra de vez pro padrão hook-local, e os poucos consumidores que hoje leem
     `availableHostedModels` do Context passam a chamar o hook diretamente
     (mais consistente com React idiomático, mas é um refactor maior, tocando
     mais arquivos do que só extrair o pacote).
- `types/llms.ts` (`LLM`, `tier`) provavelmente continua em `murici` — é um
  tipo de **apresentação** (tem `pricing`, `platformLink`, `imageInput`, coisas
  que só fazem sentido pro seletor do murici). O pacote devolve algo mais
  enxuto (`DiscoveredModel`) e `murici` faz o mapeamento pra `LLM` na borda.

## Riscos/checagens pra validar na implementação (não pesquisados a fundo aqui)

- **ESM-only vs `tsconfig.electron.json` (`module: commonjs`)**: confirmar que
  nenhum arquivo de `electron/*.ts` (main process) importa o pacote
  diretamente — hoje aparenta que não (a lógica de discovery vive nas rotas
  Next, bundladas separadamente), mas não foi verificado grep a grep.
- **TS7 vs TypeScript `^5.9.3` do murici hoje**: o pacote sendo buildado com
  tooling mais novo não deveria quebrar o consumo (o `.d.ts` publicado é o que
  importa, não a versão do compilador usada pra gerá-lo) — mas só uma
  instalação real (`file:` link + `tsc --noEmit` em murici) confirma. Nenhuma
  chamada de API do TS 7 deveria vazar pro `.d.ts` público se o pacote for
  escrito em TS comum.
- **`react` como peer dependency opcional**: replicar o padrão
  `peerDependenciesMeta.react.optional: true` do SDK (lá é `effect`) — quem só
  usa `./server`/`./local`/`./core` não deveria ser forçado a instalar React.

## Decisões em aberto (pra você, não decidido aqui)

1. **Local no repo vs pacote publicado desde já.** Recomendo local
   (`packages/autodiscovery` + `file:` link) pra não pagar custo de
   publish/versionamento antes da API estabilizar — mas se a intenção é abrir
   isso pra fora do murici desde já (complementando o próprio ecossistema
   models.dev), publicar direto no npm pode valer a pena.
2. **Reusar a infra de publish OIDC do `dot-agent-spec/platform`** ou manter
   totalmente desacoplado? O domínio (descoberta de modelos LLM) não tem
   relação temática com o DSL do dot-agent — só faz sentido reusar a infra se
   quiserem consolidar publish em um lugar só por conveniência operacional.
3. **Granularidade do hook**: um `useHostedModels()` só (cobre os 5 provedores
   remotos + Perplexity/Azure estáticos) ou hooks separados por preocupação
   (`useRemoteModels`, `useLocalModels`, `useModelTiers`)? Afeta diretamente o
   ponto de fricção do Context citado acima.

## Related

- [ADR-0005](../adr/0005-remote-model-live-discovery.md) — discovery ao vivo original
- Este plano (`013`) segue o accordion (`j-planeja-para-o-dapper-treehouse.md`,
  já implementado nesta sessão) que motivou a pergunta: "vale separar isso?"
- SDK estudado: `@opencode-ai/models` — https://github.com/anomalyco/models.dev/tree/dev/packages/sdk
  (clonado em `/private/tmp/claude-501/.../scratchpad/models-dev-study/models.dev`
  pra esta sessão — não commitado em lugar nenhum, é só material de estudo)
- Memória: `project_murici_dot_agent_sync` (padrão `file:` já validado neste repo)