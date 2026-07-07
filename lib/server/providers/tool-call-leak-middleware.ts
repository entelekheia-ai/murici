/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { LanguageModelMiddleware, Experimental_LanguageModelStreamPart as LanguageModelStreamPart } from "ai"
import { logger } from "@/lib/logger"

/**
 * Middleware that inspects raw text output from local OpenAI-compatible model
 * servers (Ollama, LM Studio, llama.cpp server, vLLM, oMLX, etc.).
 * If the model leaks a `<tool_call>{"name": "...", "arguments": {...}}</tool_call>` block
 * directly into the text stream instead of using the native Function Calling API,
 * this middleware extracts it, strips it from the text, and emits it as a proper
 * Vercel AI SDK tool call event.
 */
export const extractToolCallMiddleware: LanguageModelMiddleware = {
  wrapGenerate: async ({ doGenerate }: any) => {
    const result = await doGenerate()
    // This is a naive implementation for non-streaming. 
    // Usually local models stream, so wrapStream is more important.
    return result
  },

  wrapStream: async ({ doStream }: any) => {
    const { stream, ...rest } = await doStream()
    
    let buffer = ""
    let insideToolCall = false
    let lastTextId: string | undefined
    const TOOL_START_TAG = "<tool_call>"
    const TOOL_END_TAG = "</tool_call>"

    const flushBuffer = (controller: TransformStreamDefaultController<any>) => {
      if (buffer) {
        controller.enqueue({ type: "text-delta", id: lastTextId, delta: buffer })
        buffer = ""
      }
    }

    // Text-delta chunks in the current LanguageModel spec carry `delta` (not
    // `textDelta`) plus an `id` that ties them to their `text-start` part; we
    // reuse that id for any re-emitted text-delta chunks below.
    const transformStream = new TransformStream<any, any>({
      transform(chunk, controller) {
        if (chunk.type === "text-delta") {
          lastTextId = chunk.id
          buffer += chunk.delta

          // Check if we are starting a tool call
          if (!insideToolCall && buffer.includes(TOOL_START_TAG)) {
            const split = buffer.split(TOOL_START_TAG)
            const textBefore = split[0]
            if (textBefore) {
              controller.enqueue({ type: "text-delta", id: chunk.id, delta: textBefore })
            }
            insideToolCall = true
            buffer = split.slice(1).join(TOOL_START_TAG)
          }

          // If we are inside a tool call, we buffer until we find the end tag
          if (insideToolCall) {
            if (buffer.includes(TOOL_END_TAG)) {
              const split = buffer.split(TOOL_END_TAG)
              const jsonStr = split[0]
              buffer = split.slice(1).join(TOOL_END_TAG)
              insideToolCall = false

              try {
                const parsed = JSON.parse(jsonStr)
                const toolCallId = crypto.randomUUID()
                const toolName = parsed.name || parsed.intent_name || "unknown"
                const input = JSON.stringify(parsed.arguments || parsed)

                controller.enqueue({ type: "tool-input-start", id: toolCallId, toolName })
                controller.enqueue({ type: "tool-input-delta", id: toolCallId, delta: input })
                controller.enqueue({ type: "tool-input-end", id: toolCallId })
                controller.enqueue({ type: "tool-call", toolCallId, toolName, input })
              } catch (e) {
                logger.warn("Failed to parse leaked tool_call JSON from local model", { jsonStr })
                // Fallback, emit as text
                controller.enqueue({ type: "text-delta", id: chunk.id, delta: TOOL_START_TAG + jsonStr + TOOL_END_TAG })
              }

              // Flush any remaining buffer text
              if (buffer && !buffer.includes(TOOL_START_TAG)) {
                controller.enqueue({ type: "text-delta", id: chunk.id, delta: buffer })
                buffer = ""
              }
            }
          } else {
            // Not inside a tool call and no start tag, we can emit safely
            // but we need to keep a small buffer in case the tag is split across chunks
            const safeLen = Math.max(0, buffer.length - TOOL_START_TAG.length)
            if (safeLen > 0) {
              controller.enqueue({ type: "text-delta", id: chunk.id, delta: buffer.slice(0, safeLen) })
              buffer = buffer.slice(safeLen)
            }
          }
        } else if (chunk.type === "text-end") {
          // Flush whatever text we were holding back (for tag-boundary safety)
          // before closing out this text part, so no delta arrives after its end.
          flushBuffer(controller)
          insideToolCall = false
          controller.enqueue(chunk)
        } else {
          controller.enqueue(chunk)
        }
      },
      flush(controller) {
        flushBuffer(controller)
      }
    })

    return {
      stream: stream.pipeThrough(transformStream),
      ...rest
    }
  }
}
