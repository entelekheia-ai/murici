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

import { LanguageModelMiddleware } from "ai"
import { LanguageModelV4StreamPart } from "@ai-sdk/provider"
import { logger } from "@/lib/logger"
import { jsonrepair } from "jsonrepair"

/**
 * Middleware that inspects raw text output from local OpenAI-compatible model
 * servers (Ollama, LM Studio, llama.cpp server, vLLM, oMLX, etc.).
 * If the model leaks a `<tool_call>{"name": "...", "arguments": {...}}</tool_call>` block
 * directly into the text stream instead of using the native Function Calling API,
 * this middleware extracts it, strips it from the text, and emits it as a proper
 * Vercel AI SDK tool call event.
 */
export const extractToolCallMiddleware: LanguageModelMiddleware = {
  wrapGenerate: async ({
    doGenerate
  }: Parameters<NonNullable<LanguageModelMiddleware["wrapGenerate"]>>[0]) => {
    const result = await doGenerate()
    // This is a naive implementation for non-streaming.
    // Usually local models stream, so wrapStream is more important.
    return result
  },

  wrapStream: async ({
    doStream
  }: Parameters<NonNullable<LanguageModelMiddleware["wrapStream"]>>[0]) => {
    const { stream, ...rest } = await doStream()

    let buffer = ""
    let insideToolCall = false
    let currentStartTag = ""
    let lastTextId: string | undefined

    const START_TAGS = ["<tool_call>", "<|python_tag|>"]
    const MAX_START_TAG_LEN = Math.max(...START_TAGS.map(t => t.length))

    const flushBuffer = (
      controller: TransformStreamDefaultController<LanguageModelV4StreamPart>
    ) => {
      if (buffer) {
        controller.enqueue({
          type: "text-delta",
          id: lastTextId || "",
          delta: buffer
        })
        buffer = ""
      }
    }

    const emitParsedToolCall = (
      controller: TransformStreamDefaultController<LanguageModelV4StreamPart>,
      id: string | undefined,
      jsonStr: string,
      startTag: string,
      endTag: string
    ) => {
      try {
        const startIdx = jsonStr.indexOf("{")
        const endIdx = jsonStr.lastIndexOf("}")
        if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) {
          throw new Error("No JSON object found")
        }

        let cleanedJsonStr = jsonStr.slice(startIdx, endIdx + 1)
        let parsed: any

        try {
          parsed = JSON.parse(cleanedJsonStr)
        } catch (e) {
          // If JSON parse fails, attempt to repair it using jsonrepair
          const repaired = jsonrepair(cleanedJsonStr)
          parsed = JSON.parse(repaired)
        }

        const toolCallId = crypto.randomUUID()

        let toolName = "unknown"
        let inputObj = {}

        // Handle Qwen format: {"type": "function", "function": {"name": "...", "parameters": {...}}}
        if (parsed.type === "function" && parsed.function) {
          toolName = parsed.function.name || "unknown"
          inputObj =
            parsed.function.parameters || parsed.function.arguments || {}
        } else {
          // Standard / OpenAI fallback
          toolName = parsed.name || parsed.intent_name || "unknown"
          // Sometimes arguments is a JSON string, sometimes an object
          if (typeof parsed.arguments === "string") {
            try {
              inputObj = JSON.parse(parsed.arguments)
            } catch (e) {
              inputObj = {}
            }
          } else {
            inputObj = parsed.arguments || parsed
          }
        }

        const input = JSON.stringify(inputObj)

        console.log("Emit parsed tool call", { toolCallId, toolName, inputObj })
        controller.enqueue({
          type: "tool-input-start",
          id: toolCallId,
          toolName
        })
        controller.enqueue({
          type: "tool-input-delta",
          id: toolCallId,
          delta: input
        })
        controller.enqueue({ type: "tool-input-end", id: toolCallId })
        controller.enqueue({ type: "tool-call", toolCallId, toolName, input })
      } catch (e) {
        console.error(
          "Failed to parse leaked tool_call JSON from local model",
          { jsonStr, e }
        )
        // Fallback, emit as text
        controller.enqueue({
          type: "text-delta",
          id: id || "",
          delta: startTag + jsonStr + endTag
        })
      }
    }

    // Text-delta chunks in the current LanguageModel spec carry `delta` (not
    // `textDelta`) plus an `id` that ties them to their `text-start` part; we
    // reuse that id for any re-emitted text-delta chunks below.
    const transformStream = new TransformStream<
      LanguageModelV4StreamPart,
      LanguageModelV4StreamPart
    >({
      transform(chunk, controller) {
        // console.log("[MIDDLEWARE] chunk in:", chunk.type, chunk)
        if (chunk.type === "text-delta") {
          lastTextId = chunk.id
          buffer += chunk.delta

          // Check if we are starting a tool call
          if (!insideToolCall) {
            const matchedTag = START_TAGS.find(tag => buffer.includes(tag))
            if (matchedTag) {
              const split = buffer.split(matchedTag)
              const textBefore = split[0]
              if (textBefore) {
                controller.enqueue({
                  type: "text-delta",
                  id: chunk.id || "",
                  delta: textBefore
                })
              }
              insideToolCall = true
              currentStartTag = matchedTag
              buffer = split.slice(1).join(matchedTag)
            }
          }

          // If we are inside a tool call, we buffer until we find the end tag
          if (insideToolCall) {
            const endTag =
              currentStartTag === "<tool_call>"
                ? "</tool_call>"
                : "</|python_tag|>"
            if (buffer.includes(endTag)) {
              const split = buffer.split(endTag)
              const jsonStr = split[0]
              buffer = split.slice(1).join(endTag)
              insideToolCall = false

              emitParsedToolCall(
                controller,
                chunk.id,
                jsonStr,
                currentStartTag,
                endTag
              )
            }
          } else {
            // Not inside a tool call and no start tag, we can emit safely
            // but we need to keep a small buffer in case the tag is split across chunks
            const safeLen = Math.max(0, buffer.length - MAX_START_TAG_LEN)
            if (safeLen > 0) {
              controller.enqueue({
                type: "text-delta",
                id: chunk.id || "",
                delta: buffer.slice(0, safeLen)
              })
              buffer = buffer.slice(safeLen)
            }
          }
        } else if (chunk.type === "text-end") {
          if (insideToolCall) {
            // Reached text end without an end tag (common for <|python_tag|>)
            const jsonStr = buffer.trim()
            emitParsedToolCall(
              controller,
              lastTextId,
              jsonStr,
              currentStartTag,
              ""
            )
            buffer = ""
            insideToolCall = false
          }
          // Flush whatever text we were holding back (for tag-boundary safety)
          // before closing out this text part, so no delta arrives after its end.
          flushBuffer(controller)
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
