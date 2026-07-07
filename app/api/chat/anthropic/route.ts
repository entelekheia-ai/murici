/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import {
  checkApiKey,
  getProfileFromBody
} from "@/lib/server/server-chat-helpers"
import { ChatSettings } from "@/types"
import { NextRequest, NextResponse } from "next/server"
import { createAnthropic } from "@ai-sdk/anthropic"
import { streamText, convertToModelMessages } from "ai"
import { buildAiSdkTools } from "@/lib/server/model-message-adapter"
import { getBuiltInTools, mapMcpTools } from "@/lib/tools/registry"
import { logger } from "@/lib/logger"

export const runtime = "edge"

// Anthropic requires an explicit prompt-cache breakpoint (unlike OpenAI/Groq,
// which cache automatically). @ai-sdk/anthropic's convertToAnthropicPrompt
// reads a message-level providerOptions.anthropic.cacheControl for the system
// message. Since buildBasePrompt's static persona+rules content is always the
// first (system-role) message, and the dynamic per-turn behavior injection is
// spliced before the last *user* message (never before the system message),
// this breakpoint lands exactly at the static/dynamic boundary.
function withAnthropicCacheBreakpoint(messages: any[]): any[] {
  if (messages[0]?.role !== "system") return messages
  const [systemMessage, ...rest] = messages
  return [
    {
      ...systemMessage,
      providerOptions: {
        ...(systemMessage.providerOptions ?? {}),
        anthropic: { cacheControl: { type: "ephemeral" } }
      }
    },
    ...rest
  ]
}

export async function POST(request: NextRequest) {
  const json = await request.json()
  const { chatSettings, messages, tools: rawTools, behaviorState, mcpTools } = json as {
    chatSettings: ChatSettings
    messages: any[]
    tools?: any[]
    behaviorState?: any
    mcpTools?: any[]
  }

  try {
    const profile = getProfileFromBody(json)

    checkApiKey(profile.anthropic_api_key, "Anthropic")

    const anthropic = createAnthropic({
      apiKey: profile.anthropic_api_key || ""
    })

    const tools = {
      ...buildAiSdkTools(rawTools),
      ...getBuiltInTools(behaviorState),
      ...mapMcpTools(mcpTools || [])
    }
    const modelMessages = withAnthropicCacheBreakpoint(await convertToModelMessages(messages, { tools }))

    const result = await streamText({
      model: anthropic(chatSettings.model),
      messages: modelMessages,
      allowSystemInMessages: true,
      temperature: chatSettings.temperature,
      tools
    })

    return result.toUIMessageStreamResponse()
  } catch (error: any) {
    logger.error("chat route failed", { provider: "anthropic", model: chatSettings?.model, error: error.message })
    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "Anthropic API Key not found. Please set it in your profile settings."
    } else if (errorCode === 401) {
      errorMessage =
        "Anthropic API Key is incorrect. Please fix it in your profile settings."
    }

    return new NextResponse(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
