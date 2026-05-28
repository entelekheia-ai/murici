/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { ChatSettings } from "@/types"
import { ServerRuntime } from "next"
import OpenAI from "openai"
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions.mjs"

export const runtime: ServerRuntime = "edge"

export async function POST(request: Request) {
  const json = await request.json()
  const { chatSettings, messages, customModel, tools } = json as {
    chatSettings: ChatSettings
    messages: any[]
    customModel: { api_key: string; base_url: string; model_id: string }
    tools?: any[]
  }

  try {
    if (!customModel?.base_url) {
      throw new Error("Custom model base_url is required")
    }

    const custom = new OpenAI({
      apiKey: customModel.api_key || "",
      baseURL: customModel.base_url
    })

    const useStreaming = !tools?.length

    const response = await custom.chat.completions.create({
      model: chatSettings.model as ChatCompletionCreateParamsBase["model"],
      messages: messages as ChatCompletionCreateParamsBase["messages"],
      temperature: chatSettings.temperature,
      stream: useStreaming,
      ...(tools?.length ? { tools, tool_choice: "auto" } : {})
    } as any)

    if (!useStreaming) {
      return Response.json(response)
    }

    // Custom streaming: handles both delta.content and delta.reasoning_content
    // (used by Qwen3, DeepSeek R1 and other thinking models via OpenAI-compatible APIs).
    // We wrap reasoning_content in <think>...</think> so the client parser can extract it.
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        let thinkOpen = false
        try {
          for await (const chunk of response as any) {
            const delta = chunk.choices?.[0]?.delta as any

            if (delta?.reasoning_content) {
              if (!thinkOpen) {
                controller.enqueue(encoder.encode("<think>"))
                thinkOpen = true
              }
              controller.enqueue(encoder.encode(delta.reasoning_content))
            }

            if (delta?.content) {
              if (thinkOpen) {
                controller.enqueue(encoder.encode("</think>"))
                thinkOpen = false
              }
              controller.enqueue(encoder.encode(delta.content))
            }
          }
        } finally {
          if (thinkOpen) controller.enqueue(encoder.encode("</think>"))
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    })
  } catch (error: any) {
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
