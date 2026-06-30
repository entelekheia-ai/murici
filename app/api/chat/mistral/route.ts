/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { checkApiKey, getProfileFromBody } from "@/lib/server/server-chat-helpers"
import { ChatSettings } from "@/types"
import { createOpenAI } from "@ai-sdk/openai"
import { streamText, generateText, tool as createTool, jsonSchema } from "ai"

export const runtime = "edge"

function buildAiSdkTools(rawTools?: any[]): Record<string, any> | undefined {
  if (!rawTools || rawTools.length === 0) return undefined
  const tools: Record<string, any> = {}
  for (const t of rawTools) {
    if (t.type === "function") {
      tools[t.function.name] = createTool({
        description: t.function.description,
        inputSchema: jsonSchema(t.function.parameters),
      })
    }
  }
  return tools
}

export async function POST(request: Request) {
  const json = await request.json()
  const { chatSettings, messages, tools: rawTools } = json as {
    chatSettings: ChatSettings
    messages: any[]
    tools?: any[]
  }

  try {
    const profile = getProfileFromBody(json)

    const KEY = profile.mistral_api_key

    checkApiKey(KEY, "Mistral")

    const custom = createOpenAI({
      apiKey: KEY || "",
      baseURL: "https://api.mistral.ai/v1"
    })

    const useStreaming = !rawTools?.length
    const tools = buildAiSdkTools(rawTools)

    if (!useStreaming) {
      const result = await generateText({
        model: custom(chatSettings.model),
        messages,
        temperature: chatSettings.temperature,
        tools
      })

      return Response.json({
        choices: [
          {
            message: {
              content: result.text || "",
              tool_calls: result.toolCalls?.map(call => ({
                id: call.toolCallId,
                type: "function",
                function: {
                  name: call.toolName,
                  arguments: JSON.stringify(call.input)
                }
              }))
            }
          }
        ]
      })
    }

    const result = await streamText({
      model: custom(chatSettings.model),
      messages,
      temperature: chatSettings.temperature
    })

    return result.toTextStreamResponse()
  } catch (error: any) {
    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "Mistral API Key not found. Please set it in your profile settings."
    } else if (errorCode === 401) {
      errorMessage =
        "Mistral API Key is incorrect. Please fix it in your profile settings."
    }

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
