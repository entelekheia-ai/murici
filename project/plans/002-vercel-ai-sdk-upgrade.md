# Plan 002: Vercel AI SDK Upgrade & XML Tags Fallback (Vercel AI SDK v7)

## Objetivo

Atualizar o SDK de Inteligência Artificial da Vercel (pacote `ai`) para a versão `@latest` (v7+) e corrigir o vazamento de tags XML (`<tool_call>` e `<think>`) que estão aparecendo indevidamente na interface de chat e na exibição do raciocínio.

## Entendimento do Problema

1. **Vazamento de `<think>`:** Atualmente, a aplicação usa `extractThinkBlocks` para procurar tags `<think>` no texto bruto em tempo de streaming e ocultá-las. Porém, como o streaming é manual e algumas respostas vêm fragmentadas de forma imprevisível (ou o provedor empacota o raciocínio no `delta.content` sem tags explícitas bem formadas), o texto escapa para o usuário. 
2. **Vazamento de `<tool_call>`:** O `trigger_intent` e outras chamadas estão sendo expostas pelo LLM em texto livre (XML tags brutas) em vez de como uma estrutura nativa de "function call". O SDK legado não filtra isso adequadamente no frontend, resultando no LLM "cuspindo" a intenção diretamente na tela do usuário.

## Alterações Propostas

Com a atualização para o Vercel AI SDK v7, a Vercel introduziu o **Data Stream Protocol**, que isola nativamente texto comum, raciocínio (reasoning tokens) e execuções de ferramentas (tool calls) diretamente no nível do fluxo da API, sem precisar depender de Regex frágeis no frontend.

---

### 1. Dependências do Projeto (`package.json`)
Atualizaremos os pacotes essenciais do AI SDK.
#### [MODIFY] [package.json](../../package.json)
- Atualizar `"ai"` para `@latest`.
- Instalar os provedores oficiais do AI SDK: `"@ai-sdk/openai"`, `"@ai-sdk/anthropic"`, `"@ai-sdk/google"`, `"@ai-sdk/azure"`, `"@ai-sdk/mistral"` para substituir as integrações manuais rest/SDK.

---

### 2. Rotas da API de Chat (Backend)
Iremos reescrever as rotas de backend para usar as novas funções `streamText` e `generateText` com suporte nativo a ferramentas (tools) e protocolo de stream de dados.
#### [MODIFY] [app/api/chat/openai/route.ts](../../app/api/chat/openai/route.ts)
#### [MODIFY] [app/api/chat/anthropic/route.ts](../../app/api/chat/anthropic/route.ts)
#### [MODIFY] [app/api/chat/custom/route.ts](../../app/api/chat/custom/route.ts)
- Utilizar os provedores oficiais (e.g., `createOpenAI`, `anthropic`).
- Substituir a iteração manual de `for await` e `Response` raw por `result.toDataStreamResponse()`.
- Ferramentas (`trigger_intent` e ferramentas MCP) serão repassadas na configuração nativa `tools` de `streamText` ou `generateText`. Isso instrui o modelo a devolver tool calls estruturados (JSON nativo via API) ao invés de texto XML, matando a raiz do vazamento do `<tool_call>`.

---

### 3. Parsing do Streaming (Frontend)
Substituir a lógica legada e frágil de parsing por regex.
#### [MODIFY] [components/chat/chat-helpers/index.ts](../../components/chat/chat-helpers/index.ts)
- Importar `parseDataStreamPart` ou usar o loop do novo Data Stream Protocol fornecido pelo `ai`.
- Remover a função `extractThinkBlocks` inteiramente (já que os tokens de raciocínio não virão mais misturados no texto, mas sim como partes do tipo `reasoning` / tag `g:` no novo protocolo).
- Processar partes do tipo `tool_call` de modo a manter o `trigger_intent` 100% invisível na interface (ocultando seu retorno).

---

## Decisão de Design: Fallback para Modelos sem Suporte Nativo a Tools
> [!NOTE]
> **Como lidaremos com provedores que não suportam tools nativamente?**
> É muito difícil detectar com 100% de certeza em tempo de execução se um modelo (especialmente em endpoints customizados/locais que imitam a API da OpenAI, como LM Studio ou Ollama) suporta ferramentas apenas inspecionando a resposta da API. Muitas vezes, esses endpoints aceitam o array `tools` na requisição sem dar erro, mas o modelo por baixo acaba ignorando o schema JSON e cospe o texto em raw XML (como `<tool_call>...`).
> 
> **A Solução:**
> 1. Nós **sempre** passaremos as ferramentas via objeto `tools` nativo do SDK. Assim, modelos competentes (OpenAI, Anthropic, Mistral, Groq, Llama-3.3, etc.) usarão function calling silenciosamente, e nada vazará.
> 2. Implementaremos um **mecanismo defensivo de fallback visual e funcional** no frontend (`chat-helpers/index.ts`). À medida que o texto chega via stream, se identificarmos a abertura de um bloco `<tool_call>`, nós interceptamos e ocultamos da UI. Quando o bloco for fechado com `</tool_call>`, faremos o parse da string XML (identificando a função e os parâmetros) e **executaremos a ferramenta correspondente** (por exemplo, disparando o evento `trigger_intent`). Isso garante que mesmo o pior modelo consiga navegar o grafo e não quebre a interface.

## Plano de Verificação

### Testes Manuais
1. Enviar mensagens para modelos avançados (ex: GPT-4o, Claude 3.5 Sonnet) com comportamento `.agent` ativo, forçando uma intenção de FSM, e garantir que a transição ocorra silenciosamente e sem vazamento de tags na UI.
2. Usar um modelo com raciocínio (`o1`, `deepseek`) e conferir que o bloco `🧠 Raciocínio` se preenche mas que o texto principal não mostra a tag de fechamento ou abertura.
3. Conferir o painel da direita para garantir que o fluxo de FSM reage corretamente à intenção disparada pelo novo setup do backend.
