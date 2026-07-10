/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import type { ModelMessage } from "ai"
import {
  streamText,
  createUIMessageStream,
  createUIMessageStreamResponse
} from "ai"
import { ChatSettings } from "@/types"
import {
  buildPersonaBlock,
  buildRulesBlock,
  injectBehaviorContextModelMessages
} from "@/lib/runtime/dot-agent-injector"
import { logger } from "@/lib/logger"

interface StreamAgentArgs {
  provider: string
  // Already-constructed (and possibly middleware-wrapped) LanguageModel.
  model: any
  chatSettings: ChatSettings
  agentPersona?: string | null
  behaviorState?: any
  modelMessages: ModelMessage[]
  tools: Record<string, any>
  // Per-provider hook applied AFTER the .agent injection (e.g. anthropic's
  // prompt-cache breakpoint), so it sees the final message list.
  transformMessages?: (messages: ModelMessage[]) => ModelMessage[]
  // Extra streamText options a specific provider needs (rarely used).
  streamOptions?: Record<string, any>
}

// The single implementation of the .agent prompt injection + debug mirror shared
// by every provider route. Extracted from app/api/chat/custom so the persona /
// RULES / FSM-state injection (and the transient data-debug the client renders
// inline) can't drift between the 9 routes — previously only `custom` had it, so
// on any other provider the model got history + tools with ZERO instruction and
// improvised tool calls as bare-JSON text. See project/adr/0004.
//
//   - `system` (static): <PERSONA> + user instructions + <RULES>, byte-identical
//     per turn so the provider's prompt-prefix cache stays warm.
//   - FSM state (per-turn): a simulated get_current_state tool exchange spliced
//     before the last user message, first turn only (injectBehaviorContext...).
//   - tools: passed straight through (built-in + MCP), never in the history.
export async function streamAgentResponse({
  provider,
  model,
  chatSettings,
  agentPersona,
  behaviorState,
  modelMessages,
  tools,
  transformMessages,
  streamOptions
}: StreamAgentArgs): Promise<Response> {
  const hasBehaviorState = !!behaviorState?.currentState

  const systemPrompt = [
    buildPersonaBlock(agentPersona || undefined),
    chatSettings.prompt ? `User Instructions:\n${chatSettings.prompt}` : "",
    buildRulesBlock(hasBehaviorState)
  ]
    .filter(Boolean)
    .join("\n\n")

  let messagesWithBehavior = injectBehaviorContextModelMessages(
    modelMessages,
    hasBehaviorState ? behaviorState : null
  )
  if (transformMessages) {
    messagesWithBehavior = transformMessages(messagesWithBehavior)
  }

  const result = await streamText({
    model,
    system: systemPrompt || undefined,
    messages: messagesWithBehavior,
    allowSystemInMessages: true,
    temperature: chatSettings.temperature,
    tools,
    ...(streamOptions || {})
  })

  // Emit a transient `data-debug` part FIRST (the exact system + final model
  // messages this request sent, post-injection) so the client's onData mirrors
  // "what really went to the model" inline. onError turns a mid-stream failure
  // (e.g. AI_NoOutputGeneratedError on an empty local completion) into a clean
  // stream error the client can toast, instead of crashing the server as an
  // unhandledRejection after this handler already returned.
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({
        type: "data-debug",
        transient: true,
        data: {
          provider,
          model: chatSettings?.model,
          system: systemPrompt || null,
          messages: messagesWithBehavior
        }
      } as any)
      writer.merge(result.toUIMessageStream())
    },
    onError: (error: any) => {
      logger.error("chat stream failed", {
        provider,
        model: chatSettings?.model,
        error: error?.message
      })
      return error?.message || "An error occurred while streaming the response."
    }
  })

  return createUIMessageStreamResponse({ stream })
}
