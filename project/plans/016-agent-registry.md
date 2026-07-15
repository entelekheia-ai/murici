# 016 — Registered `.agent` bundles (register/unregister at runtime)

**Status:** briefing / não iniciado. Gerado a partir de contexto já levantado numa sessão sobre
dot-agent-cli, sem exploração dedicada do repo murici — precisa de uma sessão própria antes de
virar plano executável.

## Contexto

Murici hoje tem dois jeitos de um `.agent` bundle chegar ao runtime:

1. **System agents buildados** (`murici/agents/onboarding-agent/`, `murici/agents/background-agent/`)
   — compilados em build-time por `scripts/build-agents.js` (via `@dot-agent/compiler`'s `pack()`)
   pra `public/agents/<name>.agent`, carregados por `lib/agents/system-agents.ts`
   (`getOnboardingAgentPayload()` etc). Fixos no bundle da aplicação, não instaláveis/atualizáveis
   em runtime sem um novo build+release do murici.
2. **Drag-and-drop de usuário** (`app/api/agent/unpack/route.ts`) — carrega um `.agent` arbitrário
   sob demanda, mas (até onde essa sessão levantou) parece ser um load pontual pra uma sessão de
   chat, não uma instalação persistente/gerenciada.

Não existe hoje um terceiro conceito: um `.agent` **instalado e persistido** por fora do build
(nem system agent, nem drag-and-drop pontual), que sobrevive a reinícios do murici, pode ser
atualizado quando uma nova versão aparece, e pode ser removido. Esse conceito é o que motivou este
briefing: o dot-agent-cli quer poder instalar/manter atualizado o seu `dot-agent-helper.agent`
(ensina o formato `.agent`) dentro do murici, dando ao usuário final do murici — não só a um
assistente de código conectado via MCP — uma forma nativa, dentro do próprio chat, de aprender a
criar agentes. Isso só faz sentido se murici tiver onde guardar/gerenciar esse tipo de instalação.

## Precedente estrutural mais próximo: MCP config

Murici já resolveu um problema parecido pra servidores MCP — vale espelhar a forma, não o conteúdo:

- `lib/mcp/config-store.ts` — manifesto JSON simples em `~/.config/murici/mcp.json`
  (`getMCPConfig()`/`saveMCPConfig()`, leitura/escrita direta em disco, sem cache).
- `app/api/mcp/config/route.ts` — API Next.js `GET`/`POST` sobre esse manifesto.
- `components/utility/mcp-settings.tsx` — aba de settings pra listar/adicionar servidores.

Um sistema de "registered agents" provavelmente quer a mesma forma: um manifesto persistente +
rotas de API (`list`/`register`/`unregister`) + uma aba de settings — mas com um conteúdo genuinamente
diferente (não é só ponteiro pra um comando externo como MCP; é preciso decidir se o manifesto
aponta pra um path externo no disco ou se murici copia os bytes do `.agent` pra dentro do seu
próprio diretório de config, pra sobreviver caso o path de origem suma).

## Perguntas em aberto (não resolvidas aqui — pauta pra quando este briefing virar plano de verdade)

1. **Armazenamento**: manifesto apontando pra um path externo (ex.: o path que
   `dot-agent agents path helper` resolve, do lado do dot-agent-cli) vs. copiar os bytes do
   `.agent` pra dentro de `~/.config/murici/agents/<name>.agent` — a cópia é mais resiliente
   (sobrevive a um `npm uninstall -g @dot-agent/cli`), o ponteiro é mais simples e sempre reflete a
   versão mais nova sem re-copiar.
2. **Versionamento/atualização**: todo `.agent` bundle carrega um `aboutme.json` com versão — dá
   pra comparar e decidir se uma reinstalação deve substituir a existente. Precisa decidir a
   política (sempre atualizar automaticamente? perguntar? nunca sobrescrever silenciosamente?).
3. **Distinção de system agents**: um agente "registrado" (instalado depois do build, por um
   usuário ou por uma ferramenta externa) deveria aparecer misturado com `onboarding-agent`/
   `background-agent` na mesma lista, ou ser uma categoria visualmente/arquiteturalmente separada?
4. **Superfície de API/UI**: rotas tipo `app/api/agents/registry` (`GET` lista, `POST` registra,
   `DELETE` desregistra), reaproveitando a lógica de unpack/validação que já existe em
   `app/api/agent/unpack/route.ts`; mais uma aba de settings espelhando `mcp-settings.tsx`.
5. **Quem dispara o registro**: se a ideia é o dot-agent-cli chamar essa API automaticamente (via
   um futuro `dot-agent configure --murici`, usando o path resolvido por `dot-agent agents path
   helper`), isso só funciona enquanto o murici estiver de fato rodando localmente (app Electron
   desktop, não um serviço sempre-ativo) — vale decidir se o fluxo é "murici puxa quando abre" em
   vez de "CLI empurra a qualquer momento".

## Não-objetivos (por ora)

- Não é sobre o registro de servidores MCP (isso já existe e funciona: `lib/mcp/*`).
- Não é sobre mudar como `onboarding-agent`/`background-agent` são buildados/carregados hoje.
- Não resolve a pergunta 5 (quem dispara) — só documenta que ela existe.
