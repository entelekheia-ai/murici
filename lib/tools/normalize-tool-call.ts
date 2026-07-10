/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

export interface OrchestratorToolCall {
  toolCallId: string
  toolName: string
  args: any
}

/**
 * The single mapping point between a Vercel AI SDK v5 tool call and the
 * orchestrator's contract.
 *
 * v5 tool calls (both StaticToolCall and DynamicToolCall) carry the parsed
 * arguments on `input`; executeClientTool / the executors expect `args`.
 * Reading `.args` off a raw v5 tool call yields `undefined`, which crashed
 * executors deep in their bodies (e.g. trigger_intent: "Cannot read properties
 * of undefined (reading 'intent_name')") — a silent, model-independent break.
 * Keep this the only place that bridges the two shapes so the contract can't
 * drift again unnoticed. The `?? args` fallback tolerates any caller that
 * already speaks the orchestrator shape.
 */
export function normalizeToolCall(toolCall: {
  toolCallId: string
  toolName: string
  input?: unknown
  args?: unknown
}): OrchestratorToolCall {
  return {
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    args: toolCall.input ?? toolCall.args
  }
}
