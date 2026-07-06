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
import { NextRequest, NextResponse } from "next/server"
import { createAnthropic } from "@ai-sdk/anthropic"
import { streamText, generateText } from "ai"
import { toModelMessages, buildAiSdkTools } from "@/lib/server/model-message-adapter"

export const runtime = "edge"

// Anthropic requires an explicit prompt-cache breakpoint (unlike OpenAI/Groq,
// which cache automatically). @ai-sdk/anthropic's convertToAnthropicPrompt
// reads a message-level providerOptions.anthropic.cacheControl for the system
// message. Since buildBasePrompt's static persona+rules content is always the
// first (system-role) message, and the dynamic per-turn behavior injection is
// spliced before the last *user* message (never before the system message),
// this breakpoint lands exactly at the static/dynamic boundary.
function withAnthropicCacheBreakpoint(messages: any[]): any[] {
  if (messages[0]?.role !== "system") return messages
  const [systemMessage, ...rest] = messages
  return [
    {
      ...systemMessage,
      providerOptions: {
        ...(systemMessage.providerOptions ?? {}),
        anthropic: { cacheControl: { type: "ephemeral" } }
      }
    },
    ...rest
  ]
}

export async function POST(request: NextRequest) {
  const json = await request.json()
  const { chatSettings, messages, tools: rawTools } = json as {
    chatSettings: ChatSettings
    messages: any[]
    tools?: any[]
  }

  try {
    const profile = getProfileFromBody(json)

    checkApiKey(profile.anthropic_api_key, "Anthropic")

    const anthropic = createAnthropic({
      apiKey: profile.anthropic_api_key || ""
    })

    const useStreaming = !rawTools?.length
    const tools = buildAiSdkTools(rawTools)
    const modelMessages = withAnthropicCacheBreakpoint(toModelMessages(messages))

    if (!useStreaming) {
      const result = await generateText({
        model: anthropic(chatSettings.model),
        messages: modelMessages,
        allowSystemInMessages: true,
        temperature: chatSettings.temperature,
        tools
      })

      return NextResponse.json({
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
      model: anthropic(chatSettings.model),
      messages: modelMessages,
      allowSystemInMessages: true,
      temperature: chatSettings.temperature
    })

    return result.toTextStreamResponse()
  } catch (error: any) {
    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "Anthropic API Key not found. Please set it in your profile settings."
    } else if (errorCode === 401) {
      errorMessage =
        "Anthropic API Key is incorrect. Please fix it in your profile settings."
    }

    return new NextResponse(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
