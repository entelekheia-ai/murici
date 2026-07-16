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
import { createGoogleGenerativeAI } from "@ai-sdk/google"
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

    checkApiKey(profile.google_gemini_api_key, "Google")

    const google = createGoogleGenerativeAI({
      apiKey: profile.google_gemini_api_key || ""
    })

    const tools = {
      ...buildAiSdkTools(rawTools),
      ...getBuiltInTools(behaviorState),
      ...mapMcpTools(mcpTools || [])
    }
    const modelMessages = await convertToModelMessages(messages, { tools })

    return await streamAgentResponse({
      provider: "google",
      model: google(chatSettings.model),
      chatSettings,
      agentPersona,
      behaviorState,
      modelMessages,
      tools
    })
  } catch (error: any) {
    logger.error("chat route failed", {
      provider: "google",
      model: chatSettings?.model,
      error: error.message
    })
    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "Google Gemini API Key not found. Please set it in your profile settings."
    } else if (errorMessage.toLowerCase().includes("api key not valid")) {
      errorMessage =
        "Google Gemini API Key is incorrect. Please fix it in your profile settings."
    }

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
