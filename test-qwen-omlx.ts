/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { sanitizeStreamText } from "./components/chat/chat-helpers/index.js"

// We are simulating the two main scenarios with Qwen running locally via OMLX

console.log("=== Teste 1: Qwen usa Tool Calls nativos (mas retorna content: null) ===")

// Payload real retornado pelo OMLX/Ollama
const qwenNativeResponse = {
  role: "assistant",
  content: null,
  tool_calls: [
    {
      id: "call_1c14681c",
      type: "function",
      function: {
        name: "murici__state_graph",
        arguments: "{}"
      }
    }
  ]
}

// Simulando a correção no chat-helpers
const assistantMsg = {
  role: "assistant",
  content: qwenNativeResponse.content ?? "", // A correção que aplicamos
  tool_calls: qwenNativeResponse.tool_calls
}

// Simulando o insert no banco de dados
const dbContent = typeof assistantMsg.content === "string" 
  ? assistantMsg.content 
  : JSON.stringify(assistantMsg.content)

console.log("Resultado do DB Content (deve ser vazio, não 'null'):", `"${dbContent}"`)
if (dbContent === "") {
  console.log("✅ Sucesso! O chat não vai renderizar a palavra 'null' no balão de mensagem.")
} else {
  console.log("❌ Falha! Ainda está salvando como 'null'.")
}

console.log("\n=== Teste 2: Qwen vaza a chamada de ferramenta no texto (Fallback XML) ===")

const qwenXmlLeakResponse = {
  role: "assistant",
  content: "Vou verificar o grafo de estados para você.\n<tool_call>\n<function=trigger_intent>\n<parameter=intent_name> generate </parameter>\n</function>\n</tool_call>"
}

const { displayText, thinkingText, foundTool } = sanitizeStreamText(qwenXmlLeakResponse.content)

console.log("Texto limpo para a UI (displayText):", JSON.stringify(displayText))
console.log("Ferramenta encontrada (foundTool):", foundTool)

if (!displayText.includes("<tool_call>") && foundTool?.name === "trigger_intent" && foundTool?.arguments?.intent_name === "generate") {
  console.log("✅ Sucesso! O XML foi removido da tela e a intenção foi capturada para execução.")
} else {
  console.log("❌ Falha no fallback XML.")
}
