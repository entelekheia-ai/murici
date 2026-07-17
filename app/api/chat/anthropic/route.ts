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
import { convertToModelMessages } from "ai"
import { buildAiSdkTools } from "@/lib/server/model-message-adapter"
import { getBuiltInTools, mapMcpTools } from "@/lib/tools/registry"
import { streamAgentResponse } from "@/lib/server/agent-stream"
import { logger } from "@/lib/logger"

export const runtime = "edge"

export async function POST(request: NextRequest) {
  const json = await request.json()
  const {
    chatSettings,
    messages,
    tools: rawTools,
    behaviorState,
    mcpTools,
    agentPersona
  } = json as {
    chatSettings: ChatSettings
    messages: any[]
    tools?: any[]
    behaviorState?: any
    mcpTools?: any[]
    agentPersona?: string | null
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
    const modelMessages = await convertToModelMessages(messages, { tools })

    // NOTE: the anthropic prompt-cache breakpoint (providerOptions.anthropic
    // .cacheControl on the leading system message) was dropped here: the shared
    // helper now sends persona/RULES via streamText's `system` param, not as a
    // leading system message, so the old breakpoint was a no-op. Re-adding proper
    // anthropic cache control on the `system` param is a follow-up.
    return await streamAgentResponse({
      provider: "anthropic",
      model: anthropic(chatSettings.model),
      chatSettings,
      agentPersona,
      behaviorState,
      modelMessages,
      tools
    })
  } catch (error: any) {
    logger.error("chat route failed", {
      provider: "anthropic",
      model: chatSettings?.model,
      error: error.message
    })
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
