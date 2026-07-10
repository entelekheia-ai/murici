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
import { getMessageText, getToolInvocations, dedupeToolCallParts } from "./ui-message-parts"

describe("getMessageText", () => {
  it("joins text parts into a single string", () => {
    const message: any = {
      role: "assistant",
      parts: [
        { type: "text", text: "Hello, " },
        { type: "text", text: "world" }
      ]
    }
    expect(getMessageText(message)).toBe("Hello, world")
  })

  it("ignores non-text parts", () => {
    const message: any = {
      role: "assistant",
      parts: [
        { type: "text", text: "before " },
        { type: "tool-murici__save_doc", toolCallId: "1", state: "input-available", input: {} },
        { type: "text", text: "after" }
      ]
    }
    expect(getMessageText(message)).toBe("before after")
  })

  it("returns an empty string when parts is undefined (transient/placeholder message)", () => {
    const message: any = { role: "assistant" }
    expect(getMessageText(message)).toBe("")
  })

  it("returns an empty string for undefined/null messages", () => {
    expect(getMessageText(undefined)).toBe("")
    expect(getMessageText(null)).toBe("")
  })
})

describe("getToolInvocations", () => {
  it("extracts static tool-<name> parts", () => {
    const message: any = {
      role: "assistant",
      parts: [
        {
          type: "tool-trigger_intent",
          toolCallId: "call_1",
          state: "input-available",
          input: { intent_name: "end_conversation" },
          output: undefined
        }
      ]
    }
    expect(getToolInvocations(message)).toEqual([
      {
        toolCallId: "call_1",
        toolName: "trigger_intent",
        input: { intent_name: "end_conversation" },
        output: undefined,
        state: "input-available"
      }
    ])
  })

  it("extracts dynamic-tool parts (MCP tools)", () => {
    const message: any = {
      role: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "mcp__myserver__do_thing",
          toolCallId: "call_2",
          state: "output-available",
          input: { x: 1 },
          output: { ok: true }
        }
      ]
    }
    expect(getToolInvocations(message)).toEqual([
      {
        toolCallId: "call_2",
        toolName: "mcp__myserver__do_thing",
        input: { x: 1 },
        output: { ok: true },
        state: "output-available"
      }
    ])
  })

  it("returns an empty array when there are no tool parts or parts is undefined", () => {
    expect(getToolInvocations({ role: "assistant", parts: [{ type: "text", text: "hi" }] } as any)).toEqual([])
    expect(getToolInvocations({ role: "assistant" } as any)).toEqual([])
    expect(getToolInvocations(undefined)).toEqual([])
  })
})

// Reproduces the exact store shape the onToolCall probe captured: save_doc ran
// ONCE, yet the SDK resubmit left call_14e36e35 in two different messages
// (dupToolCallIds: true, dupMessageIds: false). See project/adr/0004 log §13.
describe("dedupeToolCallParts", () => {
  const toolPart = (toolCallId: string) => ({
    type: "tool-murici__save_doc",
    toolCallId,
    state: "output-available",
    input: {},
    output: { id: "doc_1" }
  })

  it("keeps the first occurrence of a toolCallId and strips the later phantom copy", () => {
    const messages = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "salva" }] },
      { id: "j7yg", role: "assistant", parts: [toolPart("call_14e36e35")] },
      {
        id: "9jro",
        role: "assistant",
        parts: [toolPart("call_14e36e35"), { type: "text", text: "salvei!" }]
      }
    ] as any[]

    const out = dedupeToolCallParts(messages as any)

    const ids = out.flatMap((m: any) =>
      (m.parts || []).filter((p: any) => p.toolCallId).map((p: any) => p.toolCallId)
    )
    expect(ids).toEqual(["call_14e36e35"])
    expect(out).toHaveLength(3)
    expect((out[2] as any).parts).toEqual([{ type: "text", text: "salvei!" }])
    // The message that actually executed the tool is untouched (kept by identity).
    expect(out[1]).toBe(messages[1])
  })

  it("drops a message that existed ONLY to carry the phantom tool part", () => {
    const messages = [
      { id: "j7yg", role: "assistant", parts: [toolPart("call_x")] },
      { id: "9jro", role: "assistant", parts: [toolPart("call_x")] }
    ] as any[]

    const out = dedupeToolCallParts(messages as any)

    expect(out).toHaveLength(1)
    expect(out[0].id).toBe("j7yg")
  })

  it("leaves a clean conversation (distinct ids) untouched by identity", () => {
    const messages = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "oi" }] },
      { id: "a1", role: "assistant", parts: [toolPart("call_a")] },
      { id: "a2", role: "assistant", parts: [toolPart("call_b")] }
    ] as any[]

    const out = dedupeToolCallParts(messages as any)

    expect(out).toHaveLength(3)
    messages.forEach((m, i) => expect(out[i]).toBe(m))
  })
})
