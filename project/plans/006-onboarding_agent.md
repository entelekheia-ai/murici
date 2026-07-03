# Murici Onboarding & Support Agent

Este plano detalha a implementação de um helper agent nativo (`onboarding-agent`) para o Murici. Ele atuará como o ponto de primeiro contato para novos usuários, apresentando as funcionalidades principais com uma linguagem acessível para o público geral, mas contendo informações técnicas suficientes para guiar desenvolvedores.

## User Review Required

> [!IMPORTANT]
> A injeção automática no **primeiro run** ainda precisa ser definida na interface. Precisamos garantir que a UI carregue este pacote por padrão quando o IndexedDB estiver vazio, sem depender de drag-and-drop manual.

## Open Questions

1. **Auto-carregamento:** Qual será o gatilho exato na UI para carregar o `onboarding-agent`? Faremos um `useEffect` no `agent-right-panel.tsx` que checa o IndexedDB vazio e chama a API local para extrair de uma pasta `public/default-agents`?
2. ~~**Mecânica de behavior separado**~~ — **Resolvido (2026-07-03).** Ver Status abaixo.

## Status (2026-07-03)

- **`main.behavior` + `onboarding.behavior` split — implementado e verificado.** `main.behavior` faz `merge "onboarding.behavior"` no topo; `init` virou um dispatcher (`if context.onboarding == true / transition to onboarding / else / transition to responsive / end`), sem `interact` — estado de setup puro. O state `onboarding` (primeiro passo do tour, que precisa referenciar `support_fallback`) ficou em `main.behavior`; `onboarding.behavior` guarda só a continuação linear (`onboarding.agent_format` → `onboarding.features_graph` → `onboarding.mcp_setup` → `wrap_up`). `wrap_up` seta `context.onboarding = false` e oferece `on intent "explore" transition to responsive` — sem lógica de "recomeçar" (fica vNext, conforme decisão original), mas nunca prende o usuário.
  - Rodei `node dist/cli.js pack --dir murici/agents/onboarding-agent` de verdade (build do `@dot-agent/compiler`, não só o linter do IDE): **build limpo, zero erros, zero warnings.** Isso confirma que referências cross-file sem notação de ponto (`support_fallback`, `responsive`) resolvem certo no `pack` consolidado — os `E005` que aparecem no linter do IDE ao editar `onboarding.behavior` isoladamente são um artefato do live-lint (`findMergeRoot`/`consolidate` em `packages/language-server/`), não um erro real de build.
  - Nome do estado terminal: usei `wrap_up` em vez de `end`. `end` é reconhecido literalmente pelo linter (`I002`, lista `KERNEL_LIFECYCLE_NAMES` em `linter.ts`) como nome de lifecycle do kernel — evita a ambiguidade com a doc (`dsl/reference/behavior.md` lista o native state como `ended`, mas o linter checa `end`).
- **Privacy copy (Decisão 1) — aplicado.** `knowledge/features.md` §1 reescrita para focar na capacidade de rodar local (Ollama/LM Studio) em vez de prometer "never end up on any third-party servers". Texto espelhado também no `guide` de `features_graph` em `main.behavior`.
- Softening de "hallucination-proof" (`dot-agent-format.md`), nota de confiança no `mcp-setup.md`, e reescrita do `main.description` — todos aplicados.
- Comentário em PT-BR remanescente em `css/agents.css` traduzido para EN.

### Ainda bloqueado — não inventar seletores/scripts

Busquei no código-fonte do Murici (`grep` por `data-dot-id`, `open_settings_auto_task`, `models-btn` etc.) e **nenhum desses hooks de UI existe ainda no frontend** — os `run script "..."` no behavior continuam sendo chamadas para bindings que não têm handler no `use-chat-handler.tsx`. Isso confirma que as Decisões 3 e 4 abaixo dependem de trabalho de frontend ainda não feito; não faz sentido "chutar" seletores CSS ou nomes de função agora, isso só criaria a ilusão de que está pronto.

3. **`apply css` precisa virar path de arquivo real.** Confirmado no compiler (`packages/compiler`) que o efeito espera um path, não um nome semântico. `"highlight-models"` e `"theme-system"` em `main.behavior`/`onboarding.behavior` continuam como strings placeholder — faltam os arquivos `css/highlight-models.css` e `css/theme-system.css` (no padrão de `css/agents.css`) **e** os seletores reais do header/app shell do Murici, que ainda não existem.
4. **Highlight do painel de ferramentas.** `features_graph` continua reaproveitando `run script "open_agents_panel"` (decisão deliberada de escopo, ver análise abaixo). Um binding dedicado para o painel de ferramentas/grafo depende do mesmo trabalho de frontend pendente.

## Estratégia de Conteúdo e UX

- **Público-alvo:** Público geral. Linguagem simples, sem jargões de engenharia de software na superfície, mas com caminhos diretos para configuração avançada (CLI, MCP).
- **Sem Histórico de Fork:** O agente não falará sobre "ausências" (como "não usamos Supabase"). Ele descreve o Murici como ele é hoje: um cliente autossuficiente e seguro.
- **Formato `.agent`:** O SCXML não será detalhado. O formato será apresentado como um *padrão de empacotamento portátil para Agentes de IA*, focando em como ele ajuda e guia o LLM de forma segura.

---

## Análise de Viabilidade: `apply css` (Theming Dinâmico e Local ao Chat)

> [!NOTE]
> **Superseded parcialmente pela Decisão 3 (2026-07-02):** `apply css` recebe um path de arquivo, não um nome de classe solto. A ideia de toggle de classe via `globals.css` abaixo (`.highlight-models`, `.theme-system`) deve ser reimplementada como arquivos CSS dedicados (`css/highlight-models.css`, `css/theme-system.css`), no mesmo padrão de `css/agents.css`.

A ideia de usar `apply css` para injetar um tema diferenciado (ex: um dark-mode/light-mode estilizado) exclusivamente para o agente de sistema é **100% viável e excelente para a UX**. Mais importante ainda: a sua intuição de que **o efeito deve ser "local" ao chat que o invocou** (aplicando-se ao app inteiro, como fundos e sidebars, mas revertendo ao normal se o usuário clicar em outra conversa) é a arquitetura correta.

Para viabilizar isso de forma persistente e com transições suaves entre abas, adicionaremos os seguintes passos ao desenvolvimento:

1. **Na Camada de Dados (IndexedDB / Tipagem):**
   - Adicionaremos uma propriedade opcional (ex: `active_css: string[]`) à interface do objeto `Conversation` salvo no banco local.
2. **No Handler do FSM (`use-chat-handler.tsx`):**
   - Ao receber o efeito `apply_css` da DSL (ex: `"theme-system"`), nós injetamos esse valor no array `active_css` do `selectedConversation` atual e salvamos no IndexedDB. O inverso ocorre com `remove_css`.
3. **No Container Root do App (ex: Layout raiz ou wrapper superior):**
   - Criamos um observer (via React Effect) que "assiste" a mudança de conversa (`selectedConversation?.active_css`).
   - Quando o usuário entra no chat do agente, o código injeta as classes css ativas diretamente na tag `<body>` ou no `<main>` que encapsula as sidebars. Quando ele sai para um chat comum, o observer limpa essas classes, acionando a transição de volta para o tema padrão.
4. **No CSS (`globals.css`):**
   - Definimos a classe alvo `.theme-system` com a propriedade `transition-colors duration-[X]ms` que fará o "fade in/out" mudando as variáveis CSS raiz da aplicação.
5. **No Agente:**
   - O estado inicial da DSL do onboarding invocará ativamente `apply css "theme-system"`.

### Análise de Viabilidade: Gatilhos de UI Interativos (`run script` e CSS Tooltips)

A ideia de guiar o usuário visualmente apontando e abrindo elementos da interface é fantástica. Ambas as abordagens propostas são **100% viáveis** e têm impacto muito positivo:

- **CSS Tooltips com Pseudo-elementos (`apply css`):** É muito eficiente. O kernel emite `apply css "highlight-models"`. Isso adiciona a classe ao root. O `globals.css` intercepta essa classe global para modificar um botão específico (`.highlight-models #header-models-btn::after { content: "Experimente aqui!"; position: absolute; ... }`). Ao sair do estado, o agente dispara `remove css "highlight-models"` e o tooltip some perfeitamente.
- **Abertura de Painéis Laterais (`run script`):** O kernel suporta `run script "open_agents_panel"`. Atualmente o Murici não faz o binding nativo para isso, mas o impacto de adicionar é ínfimo. Basta interceptar o efeito `run_script` no `use-chat-handler.tsx` e disparar os setters do contexto global correspondentes (ex: `setShowRightPanel(true)` ou `setActiveTab("mcp")`). Isso eleva a experiência de onboarding a um nível de tutorial interativo real.
- **Auto-configuração do MCP via Agente:** Tecnicamente, o agente poderia configurar o MCP chamando `run script "configure_mcp" ["/path/do/mcp"]`, colhendo o path do usuário no chat e injetando no DB. Contudo, exigir que o usuário digite caminhos absolutos do sistema num chat de boas-vindas causa forte atrito de UX. Para o *onboarding*, a abordagem ideal é manter a fluidez: usamos o `run script` para abrir a UI de configuração (onde ele usa o File Explorer), delegando automações profundas de setup para agentes especializados (`settings-agent`) no futuro.

---

## Proposed Changes

O pacote do agente de onboarding será construído na raiz do projeto (ou no diretório interno de agents) para ser distribuído com a aplicação. (Nota: `aboutme.json` e arquivos estruturais iniciais serão gerados via `dot-agent cli init`, então não precisam ser criados manualmente).

### 1. FSM & Lógica de Roteamento

#### [NEW] agents/onboarding-agent/main.behavior
O arquivo DSL principal orquestrará a conversa através de estados bem definidos:

- **State `init`:** 
  - Dispara `apply css "theme-system"`.
  - Mensagem de boas-vindas amigável e menu principal.
- **State `local_models`:**
  - Dispara `apply css "highlight-models"` para destacar o botão no header (via pseudo-elemento CSS `::after`).
  - Dispara `run script "open_settings_auto_task"` para focar no seletor de "Modelo para Tarefas Automáticas". O agente alerta que essa configuração é recomendada para o uso de sub-rotinas (como gerar títulos e a feature Enrich).
  - Explica a Autodescoberta de modelos locais (Ollama, LM Studio).
  - (Futuro) Ao transitar de volta para init ou outro estado, dispara `remove css "highlight-models"`.
- **State `agent_format`:**
  - Dispara `run script "open_agents_panel"` para abrir a barra lateral de agentes fisicamente para o usuário.
  - Descreve o `.agent` como formato de troca seguro e portátil. Sugere o CLI para authoring.
- **State `features_graph`:**
  - Dispara `run script "open_agents_panel"` (reutilizando a mecânica para focar o usuário na área correta, sem gerar um script de highlight complexo agora).
  - Explica o Grafo de Conhecimento, salvamento via IndexedDB e Enrich.
- **State `mcp_setup`:**
  - Dispara `run script "open_mcp_config"` para abrir o modal/painel de configuração do MCP.
  - Guia de configuração passo a passo.
- **State `support_fallback`:**
  - O fallback (`on offtopic`). Redireciona o usuário de volta ao menu principal gentilmente.

### 2. Base de Conhecimento (RAG)

Para que o agente tenha respostas consistentes sem estourar o limite do system prompt global, arquivos markdown específicos serão mapeados via efeito `teach`:

#### [NEW] agents/onboarding-agent/knowledge/local-models.md
Documentação descrevendo como ativar Ollama, LM Studio, e como a UI do Murici auto-conecta essas instâncias.

#### [NEW] agents/onboarding-agent/knowledge/dot-agent-format.md
Guia conceitual do pacote `.agent`. Direciona o desenvolvedor para instalar o `@dot-agent/cli` caso deseje authoring, apontando para comandos de criação e uso do MCP do próprio CLI.

#### [NEW] agents/onboarding-agent/knowledge/features.md
Manual de uso das features visuais do Murici: o funcionamento do Grafo, botão de salvar, e como acionar o "Enrich" em conversas e artefatos.

#### [NEW] agents/onboarding-agent/knowledge/mcp-setup.md
Guia de configuração passo a passo de Model Context Protocol no Murici.

## Verification Plan

### Modificações UI/Engine
- Implementar o array de `activeStyles` no React Context para capturar `apply_css`.
- Atualizar o tailwind/CSS para contemplar a classe `.theme-system`.

### Agente Onboarding
- Fazer scaffold inicial com `dot-agent cli`.
- Preencher a DSL e o conhecimento.
- Testar drag-and-drop inicial para validar se o CSS carrega corretamente.
- Configurar rotina de inicialização ("Zero-State") para droppar o arquivo automaticamente ao abrir o app sem histórico.
