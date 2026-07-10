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

export type FlowEventType =
  | "flow_context" // FSM state + goal/guide/teach/intents at turn start
  | "llm_request" // messages sent to LLM
  | "tool_call" // LLM fired a tool (trigger_intent / MCP / save_doc)
  | "fsm_transition" // send_intent result + effects + new state
  | "second_turn" // second LLM call after tool result
  // Full-wire mirror events (real-time, one per actual exchange step):
  | "client_request" // the exact body the client POSTed to /api/chat/*
  | "server_prompt" // what the route ACTUALLY sent the model (system + messages)
  | "tool_result" // a client-side tool's output (what went back to the model)
  | "llm_response" // the assistant message the model produced (on finish)
  | "error" // a streaming/route error surfaced to the client

export interface FlowEvent {
  id: string
  seqNum: number
  type: FlowEventType
  timestamp: number
  data: Record<string, any>
}
