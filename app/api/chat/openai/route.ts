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
import { ServerRuntime } from "next"
import { createOpenAI } from "@ai-sdk/openai"
import { convertToModelMessages } from "ai"
import { buildAiSdkTools } from "@/lib/server/model-message-adapter"
import { getBuiltInTools, mapMcpTools } from "@/lib/tools/registry"
import { streamAgentResponse } from "@/lib/server/agent-stream"
import { logger } from "@/lib/logger"

export const runtime: ServerRuntime = "edge"

export async function POST(request: Request) {
  const json = await request.json()
  const { chatSettings, messages, tools: rawTools, behaviorState, mcpTools, agentPersona } = json as {
    chatSettings: ChatSettings
    messages: any[]
    tools?: any[]
    behaviorState?: any
    mcpTools?: any[]
    agentPersona?: string | null
  }

  try {
    const profile = getProfileFromBody(json)

    checkApiKey(profile.openai_api_key, "OpenAI")

    const openai = createOpenAI({
      apiKey: profile.openai_api_key || "",
      organization: profile.openai_organization_id || undefined
    })

    const tools = {
      ...buildAiSdkTools(rawTools),
      ...getBuiltInTools(behaviorState),
      ...mapMcpTools(mcpTools || [])
    }
    const modelMessages = await convertToModelMessages(messages, { tools })

    return await streamAgentResponse({
      provider: "openai",
      model: openai(chatSettings.model),
      chatSettings,
      agentPersona,
      behaviorState,
      modelMessages,
      tools
    })
  } catch (error: any) {
    logger.error("chat route failed", { provider: "openai", model: chatSettings?.model, error: error.message })
    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "OpenAI API Key not found. Please set it in your profile settings."
    } else if (errorMessage.toLowerCase().includes("incorrect api key")) {
      errorMessage =
        "OpenAI API Key is incorrect. Please fix it in your profile settings."
    }

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
