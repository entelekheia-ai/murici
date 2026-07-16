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
import { createOpenAI } from "@ai-sdk/openai"
import { convertToModelMessages } from "ai"
import { buildAiSdkTools } from "@/lib/server/model-message-adapter"
import { getBuiltInTools, mapMcpTools } from "@/lib/tools/registry"
import { streamAgentResponse } from "@/lib/server/agent-stream"
import { logger } from "@/lib/logger"

export const runtime = "edge"

export async function POST(request: Request) {
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

    const KEY = profile.groq_api_key

    checkApiKey(KEY, "Groq")

    const custom = createOpenAI({
      apiKey: KEY || "",
      baseURL: "https://api.groq.com/openai/v1"
    })

    const tools = {
      ...buildAiSdkTools(rawTools),
      ...getBuiltInTools(behaviorState),
      ...mapMcpTools(mcpTools || [])
    }
    const modelMessages = await convertToModelMessages(messages, { tools })

    return await streamAgentResponse({
      provider: "groq",
      // .chat() forces the /v1/chat/completions endpoint. @ai-sdk/openai's
      // default custom(id) now targets the Responses API (/v1/responses),
      // which Groq's OpenAI-compat endpoint doesn't implement — tool calls
      // get rejected with "Invalid Responses API request".
      model: custom.chat(chatSettings.model),
      chatSettings,
      agentPersona,
      behaviorState,
      modelMessages,
      tools
    })
  } catch (error: any) {
    logger.error("chat route failed", {
      provider: "groq",
      model: chatSettings?.model,
      error: error.message
    })
    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "Groq API Key not found. Please set it in your profile settings."
    } else if (errorCode === 401) {
      errorMessage =
        "Groq API Key is incorrect. Please fix it in your profile settings."
    }

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
