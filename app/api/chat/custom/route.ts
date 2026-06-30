/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { ChatSettings } from "@/types"
import { ServerRuntime } from "next"
import { createOpenAI } from "@ai-sdk/openai"
import { streamText, generateText, tool as createTool, jsonSchema, extractReasoningMiddleware, wrapLanguageModel } from "ai"

export const runtime: ServerRuntime = "edge"

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
  const { chatSettings, messages, customModel, tools: rawTools } = json as {
    chatSettings: ChatSettings
    messages: any[]
    customModel: { api_key: string; base_url: string; model_id: string }
    tools?: any[]
  }

  try {
    if (!customModel?.base_url) {
      throw new Error("Custom model base_url is required")
    }

    const custom = createOpenAI({
      apiKey: customModel.api_key || "",
      baseURL: customModel.base_url
    })

    const useStreaming = !rawTools?.length
    const tools = buildAiSdkTools(rawTools)
    
    // Wrap model to automatically extract <think> tags into reasoning protocol
    const model = wrapLanguageModel({
      model: custom(chatSettings.model),
      middleware: extractReasoningMiddleware({ tagName: "think" })
    })

    if (!useStreaming) {
      const result = await generateText({
        model,
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
      model,
      messages,
      temperature: chatSettings.temperature
    })

    return result.toTextStreamResponse()
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
