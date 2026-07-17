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
import { createAzure } from "@ai-sdk/azure"
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

    checkApiKey(profile.azure_openai_api_key, "Azure OpenAI")

    const ENDPOINT = profile.azure_openai_endpoint
    const KEY = profile.azure_openai_api_key

    let DEPLOYMENT_ID = ""
    switch (chatSettings.model) {
      case "gpt-3.5-turbo":
        DEPLOYMENT_ID = profile.azure_openai_35_turbo_id || ""
        break
      case "gpt-4-turbo-preview":
        DEPLOYMENT_ID = profile.azure_openai_45_turbo_id || ""
        break
      case "gpt-4-vision-preview":
        DEPLOYMENT_ID = profile.azure_openai_45_vision_id || ""
        break
      default:
        return new Response(JSON.stringify({ message: "Model not found" }), {
          status: 400
        })
    }

    if (!ENDPOINT || !KEY || !DEPLOYMENT_ID) {
      return new Response(
        JSON.stringify({ message: "Azure resources not found" }),
        {
          status: 400
        }
      )
    }

    const azure = createAzure({
      resourceName: ENDPOINT.replace(/https?:\/\//, "").split(".")[0], // Very rough heuristic, assumes endpoint starts with resource name
      apiKey: KEY
    })

    const tools = {
      ...buildAiSdkTools(rawTools),
      ...getBuiltInTools(behaviorState),
      ...mapMcpTools(mcpTools || [])
    }
    const modelMessages = await convertToModelMessages(messages, { tools })

    return await streamAgentResponse({
      provider: "azure",
      model: azure(DEPLOYMENT_ID),
      chatSettings,
      agentPersona,
      behaviorState,
      modelMessages: modelMessages as any,
      tools
    })
  } catch (error: any) {
    const errorMessage =
      error.error?.message || error.message || "An unexpected error occurred"
    const errorCode = error.status || 500
    logger.error("chat route failed", {
      provider: "azure",
      model: chatSettings?.model,
      error: errorMessage
    })
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
