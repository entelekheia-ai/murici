export type FlowEventType =
  | "flow_context" // FSM state + goal/guide/teach/intents at turn start
  | "llm_request" // messages sent to LLM
  | "tool_call" // LLM fired trigger_intent
  | "fsm_transition" // send_intent result + effects + new state
  | "second_turn" // second LLM call after tool result

export interface FlowEvent {
  id: string
  seqNum: number
  type: FlowEventType
  timestamp: number
  data: Record<string, any>
}
