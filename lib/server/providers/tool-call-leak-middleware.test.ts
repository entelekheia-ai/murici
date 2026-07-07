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

/**
 * @jest-environment node
 */
import { extractToolCallMiddleware } from "./tool-call-leak-middleware"
import { convertArrayToReadableStream, convertReadableStreamToArray } from "ai/test"

async function runMiddleware(chunks: any[]): Promise<any[]> {
  const result: any = await (extractToolCallMiddleware.wrapStream as any)({
    doStream: async () => ({ stream: convertArrayToReadableStream(chunks) })
  })
  return convertReadableStreamToArray(result.stream) as Promise<any[]>
}

describe("extractToolCallMiddleware", () => {
  it("passes plain text through with no tool tags", async () => {
    const chunks = [
      { type: "text-start", id: "1" },
      { type: "text-delta", id: "1", delta: "hello " },
      { type: "text-delta", id: "1", delta: "world" },
      { type: "text-end", id: "1" }
    ]
    const out = await runMiddleware(chunks)

    expect(out.some((c: any) => c.type === "tool-call")).toBe(false)
    expect(out.filter((c: any) => c.type === "text-delta").map((c: any) => c.delta).join("")).toBe(
      "hello world"
    )
    expect(out[out.length - 1]).toEqual({ type: "text-end", id: "1" })
  })

  it("extracts a leaked <tool_call> tag arriving in a single chunk", async () => {
    const chunks = [
      { type: "text-start", id: "1" },
      {
        type: "text-delta",
        id: "1",
        delta:
          'Sure! <tool_call>{"name":"get_weather","arguments":{"city":"Lisbon"}}</tool_call> done'
      },
      { type: "text-end", id: "1" }
    ]
    const out = await runMiddleware(chunks)

    expect(out[0]).toEqual({ type: "text-start", id: "1" })
    expect(out[1]).toEqual({ type: "text-delta", id: "1", delta: "Sure! " })
    expect(out[2].type).toBe("tool-input-start")
    expect(out[2].toolName).toBe("get_weather")
    expect(out[3].type).toBe("tool-input-delta")
    expect(JSON.parse(out[3].delta)).toEqual({ city: "Lisbon" })
    expect(out[4].type).toBe("tool-input-end")
    expect(out[5]).toMatchObject({
      type: "tool-call",
      toolName: "get_weather",
      input: JSON.stringify({ city: "Lisbon" })
    })
    expect(out[6]).toEqual({ type: "text-delta", id: "1", delta: " done" })
    expect(out[7]).toEqual({ type: "text-end", id: "1" })
  })

  it("extracts a leaked tag split across multiple chunks", async () => {
    const chunks = [
      { type: "text-start", id: "1" },
      { type: "text-delta", id: "1", delta: '<tool_call>{"name":"trig' },
      {
        type: "text-delta",
        id: "1",
        delta: 'ger_intent","arguments":{"intent_name":"end"}}</tool_call>'
      },
      { type: "text-end", id: "1" }
    ]
    const out = await runMiddleware(chunks)

    const toolCall = out.find((c: any) => c.type === "tool-call")
    expect(toolCall.toolName).toBe("trigger_intent")
    expect(JSON.parse(toolCall.input)).toEqual({ intent_name: "end" })
  })

  it("falls back to emitting the raw tag text when the leaked JSON is malformed", async () => {
    const chunks = [
      { type: "text-start", id: "1" },
      { type: "text-delta", id: "1", delta: "<tool_call>{not valid json}</tool_call>" },
      { type: "text-end", id: "1" }
    ]
    const out = await runMiddleware(chunks)

    expect(out.some((c: any) => c.type === "tool-call")).toBe(false)
    expect(out.filter((c: any) => c.type === "text-delta").map((c: any) => c.delta).join("")).toBe(
      "<tool_call>{not valid json}</tool_call>"
    )
  })

  it("never emits a text-delta after text-end for the same id (buffer flushes before close)", async () => {
    // "hi" is shorter than TOOL_START_TAG, so it stays buffered (tag-boundary
    // safety) until text-end forces a flush — regression test for the bug
    // where the buffer used to leak out AFTER text-end had already closed.
    const chunks = [
      { type: "text-start", id: "1" },
      { type: "text-delta", id: "1", delta: "hi" },
      { type: "text-end", id: "1" }
    ]
    const out = await runMiddleware(chunks)

    const endIndex = out.findIndex((c: any) => c.type === "text-end")
    expect(endIndex).toBeGreaterThanOrEqual(0)
    expect(out.slice(endIndex + 1).some((c: any) => c.type === "text-delta")).toBe(false)
    expect(out.filter((c: any) => c.type === "text-delta").map((c: any) => c.delta).join("")).toBe(
      "hi"
    )
  })

  it("passes through non-text chunks (e.g. native tool-call events) unchanged", async () => {
    const nativeToolCall = { type: "tool-call", toolCallId: "x", toolName: "native_tool", input: "{}" }
    const out = await runMiddleware([nativeToolCall])
    expect(out).toEqual([nativeToolCall])
  })
})
