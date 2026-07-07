# Refatoração da Arquitetura do Motor de Chat e Tools 🚀

Finalizamos com sucesso a migração e refatoração arquitetural proposta para o sistema de invocação de ferramentas (Tool Calling) e logs. Todo o design "Deus" de 1200+ linhas foi quebrado em pequenas bibliotecas puras e conectadas através das primitivas mais recentes e idiomáticas da Vercel AI SDK.

Abaixo, um resumo detalhado de cada camada que foi recriada e conectada ao projeto:

> [!NOTE]
> A refatoração focou em garantir escalabilidade e observabilidade. Todos os arquivos pesados (`use-chat-handler.tsx` antigo) tiveram backups mantidos para qualquer eventualidade, e a transição preservou todo o contexto nativo do `ChatbotUIContext`.

## O Novo Orquestrador de Tools
A complexidade de invocar ferramentas do lado do cliente e integrar com servidores MCP foi delegada ao diretório `lib/tools/`:
- **`lib/tools/registry.ts`**: Fica encarregado apenas de fornecer o "menu" de ferramentas, construindo dinamicamente as definições para a Vercel SDK entender os esquemas de entrada (schemas Zod ou JSON compatíveis) baseando-se no `flowState` ativo.
- **`lib/tools/orchestrator.ts`**: O "Controlador Central" ou Orchestrator. Ele é chamado passivamente. Quando a rede reporta a intenção de usar uma ferramenta (via `useChat`), o Orquestrador processa o nome, procura os módulos correspondentes na pasta `/executors/` (ex: `save-doc`, `trigger-intent`) ou engatilha um request ao proxy MCP via `/api/mcp/execute`.

## Adoção Nativa do Vercel `useChat`
A alteração mais profunda no coração da UI. Substituímos toda a orquestração manual em `use-chat-handler.tsx` por:

```typescript
const { messages: vercelMessages, append, isLoading } = useChat({
  id: context.selectedChat?.id || "__new__",
  api: "/api/chat/custom",
  onToolCall: async ({ toolCall }) => {
    // 🔗 Chamando o Orchestrator Limpo!
    return await executeClientTool(toolCall, { ...contextInfo })
  },
  onFinish: async (message) => {
    // 💾 Persistência em Banco (IndexedDB local) ocorre discretamente aqui
  }
})
```

> [!TIP]
> A Vercel SDK mantém o histórico e sincronia via o argumento `id: chatID`. Múltiplas invocações do nosso Hook genérico agora compartilham o mesmo estado nativo daquele ID sob os panos.

## Interceptação Inteligente do `<tool_call>` com oMLX
Alguns modelos locais acabam "vazando" a string `<tool_call>{ json... }</tool_call>` no fluxo de texto direto (ao invés de usar as APIs nativas JSON de chamadas do OpenAI).
Para contornar esse erro comum dos LLMs sem precisarmos sujar a interface:
- Foi criado o **`lib/server/providers/omlx-provider.ts`**. Ele contém um **Vercel AI Middleware (`LanguageModelV1Middleware`)**.
- Durante o streaming nativo no servidor em `app/api/chat/custom/route.ts`, ele **intercepta os tokens de texto**, detecta e limpa a sujeira do modelo, e re-emite as tags como um evento padronizado de ferramenta `toolCall` oficial, consertando o modelo na fonte!

## Debugging e Winston Logging
Para monitorar todas as transições com facilidade e unificar logs para o desenvolvedor:
1. **Winston (Server)**: Instalamos o Winston para padronizar as saídas no processo Main do Electron (`electron/main.ts`), descartando os gravadores baseados puramente em Streams de OS antigos. Um wrapper limpo em `lib/logger/index.ts` está acessível para toda a aplicação node.
2. **Tempo Real (Frontend)**: O gancho passivo **`hooks/use-debug.ts`** agora sincroniza as mudanças em tempo real e de FSM (do Zustand global e arrays do Vercel) direto para a variável de estado que renderiza a bolha de UI.

### Testes sugeridos
- Você pode agora tentar acionar os agentes locais, ou invocar ferramentas propositalmente. O orquestrador cuidará do tráfego.
- Abra a console local do Electron, verifique os novos formatações geradas pelo Logger do Winston.
- Confira se o `<think>` tag nativo é devidamente processado ou enviado.
