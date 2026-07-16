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

import { tool, dynamicTool } from "ai"
import { z } from "zod"
import { saveDocSchema } from "./executors/save-doc"
import { triggerIntentSchema } from "./executors/trigger-intent"
import { BehaviorStateInfo } from "@/lib/runtime/dot-agent-injector"

/**
 * Returns the record of built-in tools compatible with Vercel AI SDK's `tools` object.
 * Note: We don't map `execute` here because Vercel AI SDK executes them on the server by default if `execute` is provided.
 * We want to execute them on the client, so we only provide the description and schema.
 */
export function getBuiltInTools(behaviorState?: BehaviorStateInfo) {
  const tools: Record<string, any> = {
    murici__save_doc: tool({
      description:
        "Save structured knowledge to the chat. Use this when the user asks you to save a document, summarize a topic for future reference, or extract a specific piece of knowledge.",
      inputSchema: saveDocSchema
    })
  }

  if (behaviorState && behaviorState.validIntents) {
    // Only allow valid intents
    tools.trigger_intent = tool({
      description:
        "Signals a state transition in the deterministic flow engine when the current state's goal is achieved or the message is off-topic. Call this only when the conversation goal has been fulfilled or the message is off-topic.",
      inputSchema: z.object({
        intent_name: z
          .enum(behaviorState.validIntents as [string, ...string[]])
          .describe("The exact intent name to trigger.")
      })
    })

    tools.murici__state_graph = tool({
      description:
        "Get the current state graph of the active FSM agent, showing all possible states and transitions.",
      inputSchema: z.object({})
    })
  }

  return tools
}

/**
 * Converts MCP tools fetched from the server into Vercel AI SDK compatible tool schemas.
 * Uses `dynamicTool()` (not `tool()`) because MCP schemas are only known at runtime,
 * which surfaces these as `dynamic-tool` UI message parts on the client.
 */
export function mapMcpTools(mcpToolsData: any[]) {
  const tools: Record<string, any> = {}

  for (const server of mcpToolsData) {
    for (const t of server.tools) {
      tools[`mcp__${server.serverName}__${t.name}`] = dynamicTool({
        description: t.description || "",
        // We fallback to any object since MCP inputSchemas can be arbitrary JSON schemas
        inputSchema: z.any()
      })
    }
  }

  return tools
}
