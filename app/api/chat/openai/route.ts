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
import OpenAI from "openai"
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions.mjs"

export const runtime: ServerRuntime = "edge"

export async function POST(request: Request) {
  const json = await request.json()
  const { chatSettings, messages, tools } = json as {
    chatSettings: ChatSettings
    messages: any[]
    tools?: any[]
  }

  try {
    const profile = getProfileFromBody(json)

    checkApiKey(profile.openai_api_key, "OpenAI")

    const openai = new OpenAI({
      apiKey: profile.openai_api_key || "",
      organization: profile.openai_organization_id
    })

    const useStreaming = !tools?.length

    const response = await openai.chat.completions.create({
      model: chatSettings.model as ChatCompletionCreateParamsBase["model"],
      messages: messages as ChatCompletionCreateParamsBase["messages"],
      temperature: chatSettings.temperature,
      max_tokens:
        chatSettings.model === "gpt-4-vision-preview" ||
        chatSettings.model === "gpt-4o"
          ? 4096
          : null,
      stream: useStreaming,
      ...(tools?.length ? { tools, tool_choice: "auto" } : {})
    } as any)

    if (!useStreaming) {
      return Response.json(response)
    }

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
