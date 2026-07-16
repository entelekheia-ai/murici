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

import { runSaveDoc } from "./executors/save-doc"
import { runTriggerIntent } from "./executors/trigger-intent"
import { BehaviorStateInfo } from "@/lib/runtime/dot-agent-injector"
import { logger } from "@/lib/logger"

/**
 * Executes a tool invocation dynamically.
 * This runs client-side inside the Vercel useChat onToolCall handler.
 */
export async function executeClientTool(
  toolCall: { toolCallId: string; toolName: string; args: any },
  context: {
    chatId: string
    messageId: string
    promptMessageId: string
    behaviorState?: BehaviorStateInfo
  }
): Promise<any> {
  const { toolName, args } = toolCall

  try {
    if (toolName === "trigger_intent") {
      return await runTriggerIntent(args, toolCall)
    }

    if (toolName === "murici__state_graph") {
      return { graph: context.behaviorState?.graph || "No graph available" }
    }

    if (toolName === "murici__save_doc") {
      return await runSaveDoc(
        args,
        context.chatId,
        context.messageId,
        context.promptMessageId
      )
    }

    if (toolName.startsWith("mcp__")) {
      const parts = toolName.split("__")
      const serverName = parts[1]
      const tName = parts[2]

      const res = await fetch("/api/mcp/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverName, toolName: tName, args })
      })

      if (!res.ok) {
        throw new Error(`MCP tool execution failed: ${res.statusText}`)
      }

      const jsonRes = await res.json()
      return jsonRes
    }

    throw new Error(`Unknown tool: ${toolName}`)
  } catch (err: any) {
    logger.error(`[ToolOrchestrator] Failed to execute ${toolName}`, {
      error: err.message
    })
    return { error: err.message || "Execution failed" }
  }
}
