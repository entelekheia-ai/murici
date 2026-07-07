# Future Plan: GenUI & Web Components Migration

Este documento detalha o planejamento futuro para a migração estrutural do frontend do Murici, saindo de um modelo fortemente acoplado ao Tailwind (`<div>` genéricas) para uma arquitetura baseada em **Web Components (Custom Elements)** e/ou **Atributos Semânticos (`data-*`)**.

## 1. Motivação e Objetivos

Com a evolução do `dot-agent-spec` e a capacidade de agentes injetarem efeitos de UI (como `apply css`), tornou-se evidente que depender de classes utilitárias (Tailwind) gera um ambiente frágil para estilização externa. 

- **Portabilidade de Temas:** Agentes (`.agent`) precisam de seletores CSS estáveis para modificar o tema do Murici (ex: `dot-chat-bubble { border-radius: 0; }`) sem quebrarem caso o Murici atualize suas classes do Tailwind.
- **Isolamento de GenUI:** O futuro de GenUI e MCP (Model Context Protocol) exige isolamento seguro. Em vez de recorrer a Iframes (que prejudicam a UX), o uso de Custom Elements com **Shadow DOM** permite que a IA gere componentes ricos cujo CSS interno não vaza para a aplicação pai.

## 2. Abordagem em Fases

A migração foi dividida em fases para evitar um refactor massivo imediato.

### Fase 1: Padronização de Seletores (HTML Semântico)
Antes de adotar o ciclo de vida completo de um Web Component no React, a primeira etapa é estabilizar o "contrato de CSS" que o Murici oferece aos agentes.

- Substituir a raiz dos componentes principais por tags customizadas vazias (O React suporta renderizar tags desconhecidas) ou aplicar atributos de dados padronizados.
- **Mapeamento Proposto:**
  - `div.message-bot` -> `<dot-bot-message>` ou `[data-dot-role="bot-message"]`
  - `div.message-user` -> `<dot-user-message>` ou `[data-dot-role="user-message"]`
  - `div.header` -> `<dot-header>` ou `[data-dot-id="header"]`
  - `div.local-model-selector` -> `<dot-model-selector>` ou `[data-dot-id="model-selector"]`
  - `div.right-sidebar` -> `<dot-agent-panel>` ou `[data-dot-id="agent-panel"]`

Isso permite que um pacote `.agent` escreva seu CSS mirando em `dot-bot-message` com garantia vitalícia de funcionamento.

### Fase 2: Shadow DOM para GenUI
Quando o ecossistema estiver pronto para renderizar "Widgets" dinâmicos gerados pelos agentes (e não apenas texto):

- Implementar uma factory de Web Components no Next.js (`customElements.define()`).
- O agente injetará um pacote GenUI que o React empacotará dentro de um `<dot-genui-sandbox>`.
- Esse componente acoplará um Shadow DOM à raiz. Todo o CSS ou HTML gerado pelo agente ficará preso dentro do Shadow DOM, eliminando a necessidade de Iframes para segurança de escopo.

## 3. Impacto no React / Tailwind

- O Tailwind continuará sendo usado normalmente para o styling interno do Murici, aplicado dentro dessas novas tags (`<dot-bot-message className="bg-zinc-800 rounded-lg p-4" />`).
- O CSS global (ou CSS injetado por agentes via `apply_css`) usará a especificidade dessas novas tags para "atropelar" o Tailwind quando necessário, garantindo que o tema do agente tenha prioridade sem necessitar do uso de `!important` a todo momento.

## 4. Próximos Passos (Quando Iniciar)

Esta migração deverá ser tratada como um Épico separado. O gatilho para o início do desenvolvimento será:
1. O suporte oficial do `dot-agent-spec` para UI Elements ricos.
2. A necessidade de publicação de múltiplos agentes (`.agent`) com temas e skins completamente distintos na loja.
