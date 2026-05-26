import { Database } from "@/supabase/types"
import { ChatSettings } from "@/types"
import { createClient } from "@supabase/supabase-js"
import { ServerRuntime } from "next"
import OpenAI from "openai"
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions.mjs"

export const runtime: ServerRuntime = "edge"

export async function POST(request: Request) {
  const json = await request.json()
  const { chatSettings, messages, customModelId, tools } = json as {
    chatSettings: ChatSettings
    messages: any[]
    customModelId: string
    tools?: any[]
  }

  try {
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: customModel, error } = await supabaseAdmin
      .from("models")
      .select("*")
      .eq("id", customModelId)
      .single()

    if (!customModel) {
      throw new Error(error.message)
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
        "Custom API Key not found. Please set it in your profile settings."
    } else if (errorMessage.toLowerCase().includes("incorrect api key")) {
      errorMessage =
        "Custom API Key is incorrect. Please fix it in your profile settings."
    }

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
