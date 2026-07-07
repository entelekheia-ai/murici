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

import { tool as createTool, jsonSchema } from "ai"

// Converts murici's OpenAI-wire chat messages (role:"tool"+tool_call_id,
// assistant role with a `tool_calls` array) into the ai SDK v7 ModelMessage
// shape it actually validates against (content as an array of typed parts:
// {type:"tool-call"|"tool-result", ...}). Needed for BOTH the existing
// trigger_intent/murici__save_doc tool exchanges and the simulated
// get_current_state exchange from lib/runtime/dot-agent-injector.ts.
export function toModelMessages(rawMessages: any[]): any[] {
  const toolNameByCallId = new Map<string, string>()

  return rawMessages.map(msg => {
    if (
      msg.role === "assistant" &&
      Array.isArray(msg.tool_calls) &&
      msg.tool_calls.length > 0
    ) {
      const parts: any[] = []
      if (msg.content) parts.push({ type: "text", text: msg.content })
      for (const call of msg.tool_calls) {
        toolNameByCallId.set(call.id, call.function.name)
        parts.push({
          type: "tool-call",
          toolCallId: call.id,
          toolName: call.function.name,
          input: safeJsonParse(call.function.arguments)
        })
      }
      return { role: "assistant", content: parts }
    }

    if (msg.role === "tool") {
      return {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: msg.tool_call_id,
            toolName: toolNameByCallId.get(msg.tool_call_id) ?? "unknown",
            output: {
              type: "text",
              value:
                typeof msg.content === "string"
                  ? msg.content
                  : JSON.stringify(msg.content)
            }
          }
        ]
      }
    }

    if (msg.role === "assistant" && (msg.content === null || msg.content === undefined)) {
      // Guard against the null-content schema failure (assistantModelMessageSchema
      // only accepts string | array, never null).
      return { ...msg, content: "" }
    }

    return msg // system/user/plain-assistant already match the schema
  })
}

function safeJsonParse(raw: string) {
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

// Moved out of every route.ts (was copy-pasted verbatim into all 9 of them).
export function buildAiSdkTools(
  rawTools?: any[]
): Record<string, any> | undefined {
  if (!rawTools || rawTools.length === 0) return undefined
  const tools: Record<string, any> = {}
  for (const t of rawTools) {
    if (t.type === "function") {
      tools[t.function.name] = createTool({
        description: t.function.description,
        inputSchema: jsonSchema(t.function.parameters)
      })
    }
  }
  return tools
}
