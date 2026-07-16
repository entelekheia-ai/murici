/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { ChatSettings } from "@/types"
import { ServerRuntime } from "next"
import { createOpenAI } from "@ai-sdk/openai"
import {
  extractReasoningMiddleware,
  wrapLanguageModel,
  convertToModelMessages
} from "ai"
import { buildAiSdkTools } from "@/lib/server/model-message-adapter"
import { getBuiltInTools, mapMcpTools } from "@/lib/tools/registry"
import { streamAgentResponse } from "@/lib/server/agent-stream"
import { logger } from "@/lib/logger"

export const runtime: ServerRuntime = "edge"

export async function POST(request: Request) {
  const json = await request.json()
  const {
    chatSettings,
    messages,
    customModel,
    tools: rawTools,
    behaviorState,
    mcpTools,
    agentPersona
  } = json as {
    chatSettings: ChatSettings
    messages: any[]
    customModel: { api_key: string; base_url: string; model_id: string }
    tools?: any[]
    behaviorState?: any
    mcpTools?: any[]
    agentPersona?: string | null
  }

  try {
    logger.info("Custom chat route body", {
      messagesCount: json.messages?.length,
      messages: json.messages?.map((m: any) => ({
        role: m.role,
        content: m.content?.slice?.(0, 50) || m.content
      }))
    })

    if (!customModel?.base_url) {
      throw new Error("Custom model base_url is required")
    }

    // Auto-discovered "local" models (Ollama, LM Studio, oMLX, etc. — see
    // app/api/models/discover/route.ts) store a bare host:port with no `/v1`
    // suffix, while manually-configured "custom" models are expected to
    // already include it. createOpenAI's baseURL must be the full API root,
    // so normalize here regardless of which bucket the model came from.
    const bareBaseUrl = customModel.base_url.replace(/\/+$/, "")
    const normalizedBaseUrl = bareBaseUrl.endsWith("/v1")
      ? bareBaseUrl
      : `${bareBaseUrl}/v1`

    const { withReasoningContentAsThink } =
      await import("@/lib/server/providers/reasoning-content-fetch")

    const custom = createOpenAI({
      apiKey: customModel.api_key || "",
      baseURL: normalizedBaseUrl,
      // Local reasoning models stream their thinking in delta.reasoning_content,
      // which @ai-sdk/openai drops. Fold it into the text stream as <think>...
      // </think> so extractReasoningMiddleware below turns it into reasoning parts.
      fetch: withReasoningContentAsThink()
    })

    const tools = {
      ...buildAiSdkTools(rawTools),
      ...getBuiltInTools(behaviorState),
      ...mapMcpTools(mcpTools || [])
    }

    // Polyfill 'parts' array for older messages to prevent convertToModelMessages from crashing or dropping them
    const normalizedMessages = messages.map(m => {
      if (!m.parts) {
        if (m.role === "user") {
          return { ...m, parts: [{ type: "text", text: m.content }] }
        }
        if (m.role === "assistant") {
          return { ...m, parts: [{ type: "text", text: m.content || "" }] }
        }
        if (m.role === "system") {
          return { ...m, parts: [{ type: "text", text: m.content || "" }] }
        }
      }
      return m
    })

    const modelMessages = await convertToModelMessages(normalizedMessages, {
      tools
    })

    const { extractToolCallMiddleware } =
      await import("@/lib/server/providers/tool-call-leak-middleware")

    // Wrap model to automatically extract <think> tags into reasoning protocol
    // and extract raw leaked <tool_call> tags from local models
    const model = wrapLanguageModel({
      // .chat() forces the /v1/chat/completions endpoint. @ai-sdk/openai's
      // default custom(id) now targets the Responses API (/v1/responses), whose
      // stream shape differs and where local servers don't surface
      // delta.reasoning_content — so the reasoning shim (and broad local-server
      // compatibility) depends on staying on chat completions.
      model: custom.chat(chatSettings.model),
      middleware: [
        extractReasoningMiddleware({ tagName: "think" }),
        extractToolCallMiddleware
      ]
    })

    // The .agent prompt injection (persona/RULES system header + per-turn FSM
    // get_current_state) and the transient data-debug mirror now live in the
    // shared helper so all 9 provider routes behave identically. See agent-stream.
    return await streamAgentResponse({
      provider: "custom",
      model,
      chatSettings,
      agentPersona,
      behaviorState,
      modelMessages,
      tools
    })
  } catch (error: any) {
    logger.error("chat route failed", {
      provider: "custom",
      model: chatSettings?.model,
      error: error.message,
      stack: error.stack
    })
    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "Custom API Key not found. Please set it in your model settings."
    } else if (errorMessage.toLowerCase().includes("incorrect api key")) {
      errorMessage =
        "Custom API Key is incorrect. Please fix it in your model settings."
    }

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
