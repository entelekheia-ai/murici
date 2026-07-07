# Proposta de Arquitetura Revisada: Respostas e Refinamentos

Excelente, suas dúvidas tocam exatamente nos pontos de maior confusão quando misturamos Next.js, Electron e Vercel AI SDK. Vamos resolver cada uma delas para amarrar essa arquitetura, e adicionar a camada de Debug e as particularidades do oMLX que você citou.

---

## 1. Ferramentas no Cliente vs IPC (Onde estamos e para onde vamos)

Atualmente, as tools são executadas no **Cliente** (no navegador/Renderer do Electron).
**Na nova arquitetura:** Continuam no **Cliente** (Orquestrador no Frontend). Como o app é Electron, se no futuro criarmos uma tool que precise ler o disco, o Orquestrador chamará o backend do Electron via **IPC** (`window.electron.invoke('ler_arquivo')`). Manter o Orquestrador no frontend facilita essa ponte com a UI e o Desktop.

---

## 2. Server vs Client (A confusão entre Rotas e Tools)

Precisamos separar a **Conexão com a IA** da **Execução da Ferramenta**:
1. **A Conexão com o Modelo (LLM): Vai para o SERVER (`/api/chat/...`)**
   - O servidor lê o stream de qualquer LLM e normaliza para o padrão Vercel AI SDK.
2. **A Execução da Tool: Fica no CLIENTE (React/Hooks)**
   - O Servidor envia um aviso para o frontend: *"Ei, execute a tool X"*.
   - O Orquestrador no frontend roda a tool e devolve o resultado pro Servidor.

---

## 3. Entendendo o `useChat` e a Persistência

O `useChat` gerencia o array temporário automaticamente na memória do React. Você digita, dá enter, e ele atualiza a tela na hora (Optimistic UI) enquanto o stream chega.
Para salvar no Supabase/IndexedDB, o `useChat` te dá o callback `onFinish(message)`. É apenas lá que chamamos as funções de persistência, eliminando todo aquele código manual do `use-chat-handler.tsx`.

---

## 4. O Componente Visual e as Tags `<think>`

Sim, o componente visual divide o `<think>` do texto final em tempo real. Como a string cresce a cada milissegundo, a caixinha do "Pensamento" se expande fluido na tela sem interrupções.

---

## 5. Nova Decisão: Provedores Customizados (Ex: oMLX)

Os modelos locais vazam ferramentas no texto bruto (Markdown JSONs) e fogem do padrão.
O Vercel AI SDK permite criar um **Custom LanguageModelV1**.
- **A Solução:** Criaremos um provedor derivado no backend (ex: `lib/server/providers/omlx-provider.ts`) que envolve as chamadas HTTP para o oMLX. Ele inspeciona o texto bruto no backend e, se detectar `<tool_call>{...}</tool_call>`, converte em chamadas oficiais (e invisíveis) de Tool Calling para o frontend.

---

## 6. A Camada de Debug: Tempo Real na Tela vs Winston no Servidor

> **Seu Comentário:** *"vamos adicionar o winston, mas fiquei pensando o meu problema do debug do chat é que nao é tempo real, e estou na dúvida do quanto injetar coisas no canal de chat é util... a ux do debug hoje é precaria e nao pode piorar. Os hooks dela devem ser melhores"*

Sua ponderação foi cirúrgica. Injetar logs no stream de dados do Vercel (`DataStreamWriter`) pode acoplar demais a interface de tela com a infraestrutura de rede, criando complexidade desnecessária para a UI. Vamos separar a **Persistência de Arquivo** (Winston) da **Visualização de UI** (Hooks Locais), focando na UX de tempo real.

**A Solução para a UX do Debug:**
1. **O Hook Dedicado (`hooks/use-debug.ts`):** 
   Vamos criar um hook puramente responsável por montar aquele objeto `FlowTurnDebug` da tela. Como toda a lógica de negócio (FSM, Agent) já roda no Cliente, esse hook "ouve" tudo na fonte.
   - Antes de enviar a requisição: Ele pega o `goal`, `guide`, e `stateAtSend` do Zustand local e atualiza a bolha de debug na tela imediatamente.
   - Quando o `useChat` dispara um `onToolCall`: O hook anexa a chamada da ferramenta na bolha. O usuário vê o JSON piscando ali na hora, sem precisar esperar a API responder.
   - Isso garante uma UX absurda: O Debug Panel se torna reativo à memória do React, não aos soluços da rede. É muito mais limpo.

2. **O Winston (O Observador Silencioso):**
   Adicionaremos o **Winston** ao projeto para resolver o problema de telemetria "debaixo dos panos".
   - No backend, o Next.js e o Electron usam o Winston para gerar arquivos de logs rotativos de altíssima qualidade (`.log`).
   - No frontend, o nosso Orquestrador de Tools dispara eventos assíncronos (`fetch('/api/log')` ou via IPC) mandando um resumo do que aconteceu para o Winston registrar no disco.
   - Assim, a interface de Debug só lida com o que é visualmente útil pro usuário, enquanto o Winston guarda tudo para o desenvolvedor investigar.

**Resumo:** O Frontend usa um hook leve e especializado (`useDebug`) para garantir a tela em tempo real com excelente UX, enquanto o Winston é adotado para unificar os rastros textuais no sistema de arquivos.

---

Com esse último refinamento (priorizando os Hooks de Debug no frontend para UX imediata e o Winston para infraestrutura), acho que não restou nenhuma ponta solta. Podemos dar o sinal verde e concluir o plano de arquitetura?
