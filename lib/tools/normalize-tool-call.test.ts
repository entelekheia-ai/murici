/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { normalizeToolCall } from "./normalize-tool-call"

// Regression guard for the exact contract break that shipped twice: AI SDK v5
// tool calls carry arguments on `input`, the orchestrator/executors read `args`.
// Reading `.args` off a v5 tool call yields undefined and crashes executors deep
// in their bodies (trigger_intent: "Cannot read properties of undefined
// (reading 'intent_name')"). This test fails loudly if the mapping ever regresses.
describe("normalizeToolCall", () => {
  it("maps a v5 tool call's `input` onto the orchestrator's `args`", () => {
    const result = normalizeToolCall({
      toolCallId: "call_abc",
      toolName: "trigger_intent",
      input: { intent_name: "offtopic" }
    })

    expect(result).toEqual({
      toolCallId: "call_abc",
      toolName: "trigger_intent",
      args: { intent_name: "offtopic" }
    })
  })

  it("preserves an empty-object input (not swapped for undefined)", () => {
    const result = normalizeToolCall({
      toolCallId: "call_1",
      toolName: "mcp__dot-agent__send_offtopic",
      input: {}
    })

    expect(result.args).toEqual({})
    expect(result.toolName).toBe("mcp__dot-agent__send_offtopic")
    expect(result.toolCallId).toBe("call_1")
  })

  it("falls back to `args` when a caller already speaks the orchestrator shape", () => {
    const result = normalizeToolCall({
      toolCallId: "call_2",
      toolName: "murici__save_doc",
      args: { title: "t" }
    } as any)

    expect(result.args).toEqual({ title: "t" })
  })
})
