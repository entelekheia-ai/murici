# Plan 009: Camada de Agentes no Grafo de Conhecimento

## Objective
Adicionar uma segunda camada de conexões ao `knowledge-graph-canvas.tsx`: nós representando agentes que interagiram com as conversas, com arestas para os chats/artefatos que tocaram, visível junto com a camada atual (conversa→conhecimento) mas com uma gramática visual própria (gradientes, não paleta nova por tipo). Sem graphify, sem `remember()`/memory_summarizer (RFC-0004 Partes 2 e 5) — só a camada visual e o write-path que a alimenta.

## Motivation
`KnowledgeRecord.agentRuns: AgentRunRef[]` já existe no tipo ([types/knowledge.ts:33](../../types/knowledge.ts)) mas nunca é populado — hardcoded `[]` em `lib/knowledge/extract.ts:82` e `chat-helpers/index.ts:1127`. O dado de "qual agente rodou numa conversa" hoje só existe em `agentBundles` (IndexedDB, 1 registro por `conversationId`). RFC-0004 Parte 6 já previa "Agent nodes — new node type for agent runs" como item de roadmap v1+; este plano é a implementação concreta desse item, na v0.2 rumo ao mockup final.

Hoje o layout é **puramente determinístico** (posição inicial calculada por fórmula fixa a partir da ordem/contagem de chats + física sem `Math.random()`), não há persistência de posição em IndexedDB. A estabilidade geográfica entre reloads — premissa de UX — vem dessa determinismo, não de um registro salvo. Qualquer mudança na camada de agente precisa preservar isso: nada de aleatoriedade na inicialização, e a visão default não pode remover/filtrar nós do dataset (isso força re-simulação de física e pode convergir num layout percebido como "diferente" mesmo sendo tecnicamente reprodutível).

## Decisões fechadas (confirmadas com o usuário)

1. **Ambos os níveis de granularidade**: agente↔conversa (via `agentBundles`, já existe) **e** agente↔artefato (via `agentRuns`, precisa passar a ser populado). Os dois alimentam a mesma camada visual.
2. **Nó único por agente, deduplicado por `agentId`** — não por conversa. Um agente usado em 3 chats vira 1 hub com 3+ arestas, criando de fato uma camada que atravessa domínios.
3. **Sem filtro/remoção de nós para focar** — reorganizar o dataset (remover nós) dispara re-stabilization cara e visualmente abrupta, e viola a premissa de estabilidade geográfica. Em vez disso: **seletor de lente gravitacional** que só re-pesa massa/gravidade por *tipo* de nó, mais **clique-pra-enquadrar** (`network.focus()`/`network.moveTo()`, puro viewport, não mexe em física nem dataset).
4. **De-ênfase por cor, não por opacidade** — opacidade reduzida derruba contraste de label (acessibilidade) e labels são exatamente o que precisa continuar legível em nós periféricos. Trocar cor tem o mesmo custo de performance que opacidade no vis-network (ambos são só `nodes.update()`/`edges.update()` → redraw, nenhum dos dois toca física), então a escolha é 100% pelo argumento de acessibilidade/controle — cor vence.
5. **Modelo de cor por tier, não por identidade individual do artefato** — nó médio (artefato) nunca precisa de cor própria/individual; a identidade de "de qual pai eu vim" vive no **gradiente da aresta e da borda**, não numa cor de preenchimento própria. Isso evita esgotar paleta com centenas de artefatos.
6. **Gradiente orgânico** (blend suave, não fatias duras) na borda dos nós médios quando há múltiplos pais — consistente com a estética "canopy orgânico" já usada no canvas (Catmull-Rom, ver `[[project_murici_knowledge_graph]]` na memória).
7. Desenhado para não fechar a porta em **múltiplos agentes por conversa e subagentes** (próximo passo, fora de escopo aqui): `agentRuns` já é array por artefato; `agentBundles` (hoje 1:1 por `conversationId`) é o único ponto que precisará virar 1:N depois.
8. **Deduplicação por bare id (`namespace/name`), não pelo id completo** — um agent ID é `namespace/name:version~digest` ([dot-agent-spec/agent-id.md](../../../dot-agent-spec/docs/reference/agent-id.md)); o `digest` muda a cada republish. Deduplicar pelo id completo faz o mesmo agente virar um nó por build/versão carregada (ex.: dois "Murici Helper" com digests diferentes). O grafo agrupa pela identidade estável (`namespace/name`), não por qual build específico produziu um artefato — `bareAgentId()` faz o split no primeiro `:` (não no `~`, que em namespaces Sourcehut aparece antes dos dois-pontos, dentro do username).

## Data layer — popular `agentRuns` e expor `agentBundles` em lote

1. `lib/local-db/agent-bundles.ts`: adicionar `getAllAgentBundles(): Promise<AgentBundleRecord[]>` (`db.getAll("agentBundles")`) — hoje só existe `getAgentBundle(conversationId)` pontual.
2. `lib/knowledge/extract.ts` — `buildKnowledgeRecords()`: aceitar `agentId?: string` opcional; se presente, popular `agentRuns: [{ agentId, runAt: new Date().toISOString(), role: "produced" }]` em vez de `[]`.
3. Nos dois call sites em `components/chat/chat-helpers/index.ts` (linha ~1221 `buildKnowledgeRecords(...)` e linha ~1113 o registro manual do `murici__save_doc`): buscar `getAgentBundle(currentChat.id)` (já async, ambos os call sites já estão em função `async`) e passar `bundle?.aboutme.id` adiante. Sem threading de prop adicional — busca pontual no IndexedDB, mesmo padrão do `await import("@/lib/local-db/knowledge")` já usado ali perto.
4. Nada muda em `types/knowledge.ts` nem na versão do schema (`agentRuns` já existe desde v2 da migration).

## Aggregation — construir os nós/arestas de agente

Novo módulo puro `lib/knowledge/agent-layer.ts`, consumido em `knowledge-graph-page.tsx` junto com `getAllKnowledgeRecords()`:

```ts
buildAgentLayer(knowledge: KnowledgeRecord[], bundles: AgentBundleRecord[]) => {
  agentNodes: Array<{ agentId, name, conversationIds: Set<string>, artifactIds: Set<string> }>
  // interactionCount = conversationIds.size + artifactIds.size
}
```

- De `bundles`: para cada `AgentBundleRecord`, `agentId = aboutme.id`, `conversationIds.add(conversationId)`.
- De `knowledge`: para cada `KnowledgeRecord`, para cada `AgentRunRef` em `agentRuns`, `artifactIds.add(k.id)` no agente correspondente.
- Um agente pode aparecer só via `bundles` (interagiu no chat mas não gerou nenhum artefato extraído) ou só via `agentRuns` (caso futuro de subagente sem bundle próprio) — union dos dois.
- Essa mesma agregação já dá, de graça, a **contagem de pais por nó médio** (quantos agentes/conversas apontam pra cada `KnowledgeRecord.id`) que o modelo de cor/gradiente abaixo precisa.

## Modelo de lentes gravitacionais (seletor de ponto de vista)

Em vez de 3 modos de tela separados (agente-central / arquivo-central / chat-central, cada um com sua própria física calibrada), **um mecanismo único**: uma tabela de prioridade que atribui massa por *tipo* de nó, trocada por um seletor de lente. Reaproveita o padrão já existente de `network.setOptions({ physics: { enabled: true }})` → deixa estabilizar → `stopPhysics()`.

| Lente | Alta (canopy, cor individual) | Média (ponto, cor padrão + borda) | Baixa/netos (ponto, cor achatada âmbar) |
|---|---|---|---|
| Default | conversa | artefato | agente |
| Chat | conversa | artefato | agente |
| Agente | agente | artefato | conversa |
| *(futuro)* Semântico | grupo/cluster (RFC-0004 Parte 3) | artefato | conversa + agente |

- **Default** = o mapa estático de hoje, inalterado. Camada de agente presente como "netos" (baixa gravidade, cor achatada, linha bem mais clara) — visível mas discreta.
- **Lente = agente**: agente sobe pra alta-tier (ganha canopy próprio, cor individual da paleta de agente), conversa desce pra baixa-tier (cor achatada âmbar).
- Troca de lente é só `nodes.update()` com massa nova por tipo + reativar física — nenhum nó é removido do dataset, então o layout default é sempre recuperável de forma idêntica ao sair da lente.
- **Clique-pra-enquadrar** é ortogonal e sempre disponível, dentro de qualquer lente: clicar um nó específico só dá pan/zoom de câmera nele (`network.focus()`), sem alterar física/dataset.
- Quando o grupo semântico (RFC-0004 Parte 3) existir, essa tabela ganha uma linha nova — grupo assume alta-tier, conversa e agente descem juntos pra baixa-tier. Nenhuma reestruturação de mecanismo, só mais uma linha na tabela.

### Hierarquia de arestas por lente

A troca de lente não muda só massa/cor dos nós — muda também **qual aresta estrutural é a "sólida" (tier1↔tier2) e qual é a "clara" (tier2↔tier3)**. Regra: tier1↔tier2 sempre sólida, tier2↔tier3 sempre clara, **tier1↔tier3 nunca é desenhada diretamente** (nem sólida nem clara — simplesmente não aparece).

| Lente | Aresta sólida (tier1↔tier2) | Aresta clara (tier2↔tier3) | Não desenhada (tier1↔tier3) |
|---|---|---|---|
| Chat/Default | `intra-*` (conhecimento↔chat) | `agent-conv-*` (chat↔agente) | conhecimento↔agente |
| Agente | `agent-know-*` (agente↔conhecimento) | `intra-*` (conhecimento↔chat) | agente↔chat |

As três arestas estruturais (`intra-*`, `agent-conv-*`, `agent-know-*`) sempre existem no dataset — o que muda por lente é só **opacidade** (sólida = 1, clara = 0.15) e **visibilidade** (`hidden: true/false`), via `edgesDataSet.update(...)` dentro de `applyLens`, no mesmo espírito de "nunca remover do dataset" da Decisão 3. `intra-*` participa das duas lentes (sólida numa, clara na outra); `agent-conv-*` e `agent-know-*` cada uma só aparece numa lente e fica `hidden` na outra.

## Modelo de cor e gradiente

Regra central: **cor resolve identidade só quando é inambígua (1 pai); qualquer ambiguidade (N pais, 0 pai) ou qualquer nível abaixo do médio (netos) é resolvido por gravidade/posição, não por nova cor.**

| Tier | Visual | Cor de preenchimento | Cor de borda |
|---|---|---|---|
| Alta | mancha de fundo (canopy, reaproveita `drawCanopy`) | própria/individual (paleta de conversa hoje, paleta de agente na lente-agente) | — |
| Média (artefato) | ponto, tamanho dinâmico | cor padrão fixa de "nó médio" (âncora de tier, nunca individual) | **gradiente orgânico** (`ctx.createConicGradient`), um stop por pai vivo, na cor daquele pai, posicionado no ângulo real da conexão (via `network.getPosition()`) |
| Baixa/netos | ponto, tamanho dinâmico | cor achatada única (âmbar), sem distinção individual | cor achatada única |

Cascata de gradiente ao longo da hierarquia (mesmo princípio de "atenua com a distância" que já vale pra gravidade):

```
mancha (pai/alta)   ──gradiente linear──▶  borda (filho/médio)
borda (filho/médio) ──gradiente linear──▶  borda (neto/baixa)
```

- **Aresta pai→filho**: gradiente linear nativo — `edge.color.inherit = "both"` do vis-network já cria `ctx.createLinearGradient` ao vivo entre as posições atuais de `from`/`to`, usando a cor de borda de cada nó como stop (confirmado lendo `node_modules/vis-network/dist/vis-network.esm.js:24761-24776`, não é suposição). Não precisa de canvas manual pra isso — só configurar `color: { inherit: "both" }` na aresta.
- **Borda do nó médio com múltiplos pais**: `ctx.createConicGradient(anguloInicial, cx, cy)`, um color stop por pai vivo no ângulo real da conexão, **blend suave** (orgânico, não fatias duras — decisão confirmada) para manter a mesma linguagem visual do canopy já existente.
- **Nó médio órfão (0 pais)**: cor padrão, sem gradiente, posição na periferia (gravidade baixa, nada o puxa).
- **Netos (baixa-tier)**: cor achatada, aresta bem mais clara/fina, pouca gravidade própria — migram fisicamente pra perto da área (nó médio/cluster) que mais usam. A "identidade" que um neto carrega é só posicional, nunca de cor.
- Isso resolve o caso N-agentes:1-arquivo sem precisar de seletor de filtro: cada aresta chegando carrega a cor do seu próprio pai, a borda combina todas via gradiente, e a posição do nó reflete qual pai puxa mais forte.

## Visual layer — `knowledge-graph-canvas.tsx`

1. Extrair paleta pra arquivo próprio `lib/knowledge/graph-theme.ts`: `PALETTE` (conversa, já existe hoje em `knowledge-graph-canvas.tsx:16`), paleta de agente (nova), token âmbar de baixa-tier, tom padrão de nó médio — todos passando por `cssVar()` (já usado no arquivo) pra respeitar tema claro/escuro.
2. Novo prop `agentBundles: AgentBundleRecord[]` em `Props` (roteado por `knowledge-home-view.tsx` → `knowledge-graph-page.tsx`, mesmo padrão de `knowledge`/`chats` hoje).
3. Novos nós `agent-${agentId}`: shape distinto de `dot` (conversa) e `square` (conhecimento) — ex. `triangle` — label = nome do agente, `size` calculado por `interactionCount` (clamp, ex. `Math.min(36, 14 + interactionCount * 3)`).
4. Nó médio (`know-*`) ganha borda customizada (conic gradient) desenhada em `beforeDrawing`/`afterDrawing`, substituindo a borda nativa do vis-network nesses nós (borda nativa fica transparente, anel customizado desenhado por cima — mesma técnica de overlay já usada pela canopy).
5. Arestas pai→filho (`intra-*` hoje, mais as novas `agent-${agentId} → know-${knowledgeId}` e `agent-${agentId} → conv-${conversationId}`) passam a usar gradiente linear em vez de cor sólida.
6. `drawCanopy` continua operando só sobre `byConv` (conversa→conhecimento) — nós/arestas de agente não entram no cálculo do hull, só ganham canopy próprio quando a lente = agente ativa essa mesma função com hub=agente.
7. Seletor de lente: nova tabela `LENS_MASS_PRIORITY` (ver seção acima) + função `applyLens(lens: "default" | "chat" | "agent")` que faz `nodes.update()` de massa por tipo e reativa física temporariamente.
8. Física dos novos tipos de nó (agente, e o anel conic-gradient do médio): mass/spring exatos só dá pra calibrar olhando o canvas renderizado — tratar como ajuste visual pós-implementação, não travar o plano nisso.
9. Handler de clique: `agent-` prefix → abrir preview do agente (nome, versão, conversas tocadas) — reaproveitar `KnowledgePreviewModal` ou modal novo simples.

## Files Changed (Anticipated)

| File | Change |
|---|---|
| `lib/local-db/agent-bundles.ts` | + `getAllAgentBundles()` |
| `lib/knowledge/extract.ts` | `buildKnowledgeRecords()` aceita `agentId?`, popula `agentRuns` |
| `components/chat/chat-helpers/index.ts` | Ambos os call sites de criação de `KnowledgeRecord` passam a buscar e propagar `agentId` |
| `lib/knowledge/agent-layer.ts` (novo) | Agregação `KnowledgeRecord[] + AgentBundleRecord[] → agentNodes` (+ contagem de pais por nó médio) |
| `lib/knowledge/graph-theme.ts` (novo) | Paletas (conversa, agente), token âmbar baixa-tier, tom padrão de nó médio, tudo via `cssVar()` |
| `components/knowledge/knowledge-graph-page.tsx` | Busca `getAllAgentBundles()` junto com `getAllKnowledgeRecords()` |
| `components/knowledge/knowledge-home-view.tsx` | Threading do novo prop `agentBundles` |
| `components/knowledge/knowledge-graph-canvas.tsx` | Novo tipo de nó/aresta, gradientes (linear em aresta, conic em borda), seletor de lente, tamanho por interação |

## Out of scope (adiado)
- `remember()`, `memory_summarizer`, clustering semântico (RFC-0004 Partes 2, 3, 5) — mas a tabela de lentes já reserva uma linha pra quando o grupo semântico chegar.
- Graphify ingestion (RFC-0007).
- `agentBundles` virar 1:N por conversa (múltiplos agentes/subagentes) — este plano só garante que o modelo de dados (`agentRuns[]` por artefato) não impede essa evolução depois.
- Filtro/remoção de nós do dataset como mecanismo de foco — decidido contra, ver Decisão 3.

## Open Questions
- Física exata dos nós de agente e do anel conic-gradient (mass/spring) — só dá pra calibrar olhando o canvas renderizado; tratar como follow-up de ajuste visual após primeira implementação.
- Papel visual de `role` (`produced`/`consumed`/`transformed`) em `AgentRunRef` — por ora todas as arestas agente→artefato usam a mesma regra de gradiente; diferenciar por tracejado/espessura fica para quando subagentes existirem de fato.