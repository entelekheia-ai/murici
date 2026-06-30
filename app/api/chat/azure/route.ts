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
      resourceName: ENDPOINT.replace(/https?:\/\//, '').split('.')[0], // Very rough heuristic, assumes endpoint starts with resource name
      apiKey: KEY,
    })

    const useStreaming = !rawTools?.length
    const tools = buildAiSdkTools(rawTools)

    if (!useStreaming) {
      const result = await generateText({
        model: azure(DEPLOYMENT_ID),
        messages: messages as any,
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
      model: azure(DEPLOYMENT_ID),
      messages: messages as any,
      temperature: chatSettings.temperature
    })

    return result.toTextStreamResponse()
  } catch (error: any) {
    const errorMessage = error.error?.message || error.message || "An unexpected error occurred"
    const errorCode = error.status || 500
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
