<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

# ADR-0001: Agent Persona Injected as `<PERSONA>` Block in System Prompt

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-06-28 |
| Deciders | Danilo Borges |

---

## Context

Agentes `.agent` podem incluir um arquivo `SOUL.md` que define a persona do agente — o tom, a voz, e a identidade que o modelo deve assumir durante a conversa. No `aboutme.json` do bundle, o campo `persona` é apenas o **nome do arquivo** (ex: `"SOUL.md"`); o conteúdo real está em `bundle.files.soul` (retornado pelo SDK).

O murici já possui dois mecanismos de injeção de contexto por estado FSM: `teach` (injeta conhecimento no `[FLOW_CONTEXT]` do system message) e `guide` (injeta estilo no último user message). A persona é diferente: ela é **fixa por agente**, não muda com transições de estado, e deve condicionar o comportamento do modelo em toda a sessão.

Era necessário definir em qual ponto do prompt a persona entra, como ela se distingue dos outros blocos, e como o conteúdo chega desde o bundle até o `buildBasePrompt`.

## Decision

We will inject the content of `bundle.files.soul` como um bloco `<PERSONA>…</PERSONA>` no system prompt, **após o bloco `<INJECT ROLE>` e antes da linha de data**, via o parâmetro `agentPersona` propagado por `ChatbotUIContext → ChatPayload → buildBasePrompt`.

O campo `persona` em `AgentAboutme` é tratado como opcional (`persona?: string`) e resolvido nos dois pontos de unpack (`electron/main.ts` e `app/api/agent/unpack/route.ts`) com `bundle.files.soul ?? am.persona`.

## Options considered

- **Option A — Injetar no system message como `<PERSONA>` (chosen)** — mantém a persona estável durante toda a sessão e semanticamente separada do `<INJECT ROLE>` (que é workspace-level); sem custo de tokens extra por turno.

- **Option B — Injetar como prefixo de cada user message (estilo `guide`)** — permitiria variar a persona por estado FSM, mas cria repetição desnecessária de tokens e viola a semântica: persona é identidade fixa, não instrução de estilo por turno.

- **Option C — Usar o campo `assistant.name` do `<INJECT ROLE>` existente** — solução rápida mas conflita com assistants do workspace e não comporta texto rico de persona.

- **Option D — Não injetar; persona fica só como metadado de display** — descartado; o campo `SOUL.md` existe exatamente para condicionar o comportamento do modelo.

## Consequences

**Fica mais fácil:**
- O modelo assume a identidade do agente desde o primeiro token sem instruções repetidas.
- A persona é versionada junto ao `.agent` e não depende de configuração manual no workspace.
- A distinção `persona / teach / guide` fica clara no código: sistema fixo / sistema por estado / usuário por turno.

**Fica mais difícil / custos aceitos:**
- A persona ocupa tokens fixos no system prompt em toda sessão, mesmo quando o agente não está em modo conversacional.
- Se dois agentes forem carregados em sequência, o `agentPersona` precisa ser resetado explicitamente — hoje o reset acontece implicitamente quando um novo bundle é carregado (o `setAgentPersona` sobrescreve), mas não ao limpar o agente.

**Follow-up:** considerar um mecanismo de reset de `agentPersona` ao iniciar nova conversa sem agente carregado.

## Related

- `electron/main.ts` — `resolveAgentFile` (unpack Electron)
- `app/api/agent/unpack/route.ts` (unpack web)
- `lib/build-prompt.ts` — `buildBasePrompt`
- `context/context.tsx`, `components/utility/global-state.tsx` — store
- `components/agents/agent-right-panel.tsx` — ponto de carga do bundle
