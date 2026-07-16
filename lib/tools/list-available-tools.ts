/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import {
  BehaviorStateInfo,
  buildTriggerIntentTool
} from "@/lib/runtime/dot-agent-injector"

/**
 * The tools available to the model right now, in OpenAI function-calling shape:
 * murici's built-ins, the FSM's `trigger_intent` (only when an agent is loaded, and
 * enumerating that state's valid intents), and whatever the MCP servers expose.
 *
 * This is a READ of the tool surface, for display — the right sidebar's "Ferramentas"
 * panel. Execution goes through lib/tools/orchestrator.ts; the request's own tool list
 * is assembled server-side. It is not the source of truth for either.
 *
 * Lifted out of components/chat/chat-helpers/index.ts, which was deleted: 12 of its 13
 * exports were dead code from the pre-AI-SDK era, and this was the only one still
 * called (ADR-0007, stage 3).
 */
export async function getMcpAndBuiltInTools(
  behaviorState?: BehaviorStateInfo
): Promise<any[]> {
  const tools: any[] = [
    {
      type: "function",
      function: {
        name: "murici__save_doc",
        description:
          "Save structured knowledge to the chat. Use this when the user asks you to save a document, summarize a topic for future reference, or extract a specific piece of knowledge.",
        parameters: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "A short, descriptive title for the document."
            },
            theme: {
              type: "string",
              description: "The general theme or topic."
            },
            summary: {
              type: "string",
              description: "A one-sentence summary of the content."
            },
            content: {
              type: "string",
              description:
                "The full content of the document, formatted in markdown."
            }
          },
          required: ["title", "theme", "summary", "content"]
        }
      }
    }
  ]

  if (behaviorState && behaviorState.validIntents) {
    tools.push(buildTriggerIntentTool(behaviorState.validIntents))
    tools.push({
      type: "function",
      function: {
        name: "murici__state_graph",
        description:
          "Get the current state graph of the active FSM agent, showing all possible states and transitions.",
        parameters: { type: "object", properties: {} }
      }
    })
  }

  try {
    const res = await fetch("/api/mcp/tools")
    if (res.ok) {
      const data = await res.json()
      for (const server of data) {
        for (const tool of server.tools) {
          tools.push({
            type: "function",
            function: {
              name: `mcp__${server.serverName}__${tool.name}`,
              description: tool.description,
              parameters: tool.inputSchema
            }
          })
        }
      }
    }
  } catch (e) {
    console.error("Failed to fetch MCP tools", e)
  }

  return tools
}
