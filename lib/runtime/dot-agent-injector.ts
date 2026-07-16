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

// This module is the single source of truth for how a loaded .agent bundle's
// persona (.description) and behavior/FSM state (.behavior) are represented
// as LLM-facing prompt text and tool payloads. New prompt-construction logic
// for any consumer (interactive chat, headless one-shot runs, future agent
// surfaces) should be added here rather than re-derived per call site.

import type { ModelMessage } from "ai"

export interface BehaviorStateInfo {
  currentState: string
  goal?: string
  guide?: string
  teach?: string
  validIntents: string[]
  graph?: string | null
}

// const RULES_BLOCK = `<RULES>
// 1. Adopt the persona and behavior defined in <PERSONA>.
// 2. IF a goal is provided in the most recent get_current_state result: guide the
//    conversation to achieve it, then silently call trigger_intent with the
//    matching intent from allowed_intents once achieved.
// 2.b. IF the user's message requires data or context from another state
// SILENTLY call trigger_intent without generating a text response.
// Wait for the new state information to answer.
// 3. IF no goal is provided: classify the user's message into one of
//    allowed_intents and immediately call trigger_intent with the matching name.
// 4. IF "offtopic" is present in allowed_intents and the message is unrelated
//    to the current goal: silently call trigger_intent with intent_name="offtopic".
// 5. Never explain, mention, or reveal your tool calls to the user.
// </RULES>`

const RULES_BLOCK = `<RULES>
1. Adopt the persona and behavior defined in <PERSONA>.
2. STATE TRANSITION FIRST: Evaluate if the user's message matches any intent in \`allowed_intents\`.
 - NOTE: Tolerate minor typos and infer the closest intended term before classifying a request as "offtopic" or "Out of scope".
 - IF the matched intent requires moving to a DIFFERENT state
 (e.g., needing context/data from another state, or triggering "offtopic" / "Out of scope"), 
 you MUST SILENTLY call \`trigger_intent\` without generating ANY text response. Wait for the new state information.
3. GOAL EXECUTION: IF the user's message can be addressed within the current state's scope, 
use the \`guide\` and \`teach\` data to generate a text response that achieves the current \`goal\`. 
4. ACHIEVED GOAL: Only IF a specific conversational goal has been fully achieved during the current state, 
silently call \`trigger_intent\` to move the flow forward.
5. Never explain, mention, or reveal your tool calls to the user.
</RULES>`

//  - IF the matched intent requires moving to a DIFFERENT state
//   (e.g., needing context/data from another state, or triggering "offtopic" / "Out of scope"),
//   you MUST SILENTLY call \`trigger_intent\` without generating ANY text response. Wait for the new state information.

// Split so buildBasePrompt can place <PERSONA> at its current early position
// and <RULES> at the very end of the static prompt (max salience, right before
// the dynamic per-turn injection below).
export function buildPersonaBlock(persona?: string): string | null {
  if (!persona) return null
  return `<PERSONA>\n${persona}\n</PERSONA>`
}

// Gated on whether a .agent/FSM is actually active, NOT on persona text —
// an agent can have an empty persona and must still get the rules, so these
// two are independent signals even though they're usually set together.
export function buildRulesBlock(hasBehaviorState: boolean): string | null {
  return hasBehaviorState ? RULES_BLOCK : null
}

// Canonical LLM-facing JSON vocabulary for FSM state — the single field
// naming every consumer (interactive tool-call injection, headless one-shot)
// uses, so goal/guide/teach/allowed_intents are never re-derived per call site.
export function buildBehaviorStatePayload(state: BehaviorStateInfo) {
  return {
    state: state.currentState,
    ...(state.goal ? { goal: state.goal } : {}),
    ...(state.guide ? { guide: state.guide } : {}),
    ...(state.teach ? { teach: state.teach } : {}),
    allowed_intents: state.validIntents
  }
}

export function buildTriggerIntentTool(validIntents: string[]) {
  return {
    type: "function",
    function: {
      name: "trigger_intent",
      description:
        "Signals a state transition in the deterministic flow engine when the current state's goal is achieved or the message is off-topic. Call this only when the conversation goal has been fulfilled or the message is off-topic.",
      parameters: {
        type: "object",
        properties: {
          intent_name: {
            type: "string",
            enum: validIntents,
            description: "The exact intent name to trigger."
          }
        },
        required: ["intent_name"]
      }
    }
  }
}

// Splices a *simulated* assistant tool-call to get_current_state (never
// declared in the real tools[] array — purely decorative, the model only
// ever witnesses it happening) plus its tool response, immediately before
// the last user message. Ephemeral: recomputed fresh on every call, never
// persisted to chat_messages — same lifecycle as the injector this replaces.
// Does not touch the system message or mutate the user's literal text.
export function injectBehaviorContext(
  messages: any[],
  state: BehaviorStateInfo | null
): any[] {
  if (!state || !state.currentState) return messages

  const payload = buildBehaviorStatePayload(state)
  const toolCallId = crypto.randomUUID()

  const fakeAssistantMsg = {
    role: "assistant",
    content: "",
    tool_calls: [
      {
        id: toolCallId,
        type: "function",
        function: { name: "get_current_state", arguments: "{}" }
      }
    ]
  }
  const fakeToolMsg = {
    role: "tool",
    tool_call_id: toolCallId,
    content: JSON.stringify(payload)
  }

  const lastUserIdx = messages.map(m => m.role).lastIndexOf("user")
  const insertAt = lastUserIdx === -1 ? messages.length : lastUserIdx

  return [
    ...messages.slice(0, insertAt),
    fakeAssistantMsg,
    fakeToolMsg,
    ...messages.slice(insertAt)
  ]
}

// Same idea as injectBehaviorContext, but emitting Vercel AI SDK ModelMessage
// parts instead of the raw OpenAI chat-completions shape. The interactive chat
// route runs convertToModelMessages() first and then streamText(), so the
// simulated get_current_state exchange has to be spliced in as ModelMessages
// (tool-call / tool-result parts) rather than the { tool_calls } / { role:"tool" }
// wire shape the pass-through client path used. Kept here next to its twin so
// both stay the single source of truth for how FSM state reaches the model.
export function injectBehaviorContextModelMessages(
  messages: ModelMessage[],
  state: BehaviorStateInfo | null
): ModelMessage[] {
  if (!state || !state.currentState) return messages

  // Only inject on the first turn of a step — i.e. when the conversation ends
  // with the user's message awaiting a first response. On the automatic
  // tool-result resubmit the conversation ends with a tool result that already
  // carries the freshly-advanced FSM state (trigger_intent returns it), so
  // re-injecting a get_current_state here would be redundant and cost prompt
  // cache from that point on. (We measured the "weak model re-fires because it
  // ignores the resubmit state" hypothesis directly against the real model via
  // scripts/agent-loop-repro.mjs: at the clean resubmit decision point it
  // answered with text 5/5 and never re-fired — so re-asserting state here buys
  // nothing for the models we run. The duplication was the client-side
  // double-resubmit race, fixed by the one-shot guard in chat-handler-provider,
  // not by prompt salience. See project/adr/0004 log §8–9.)
  if (messages[messages.length - 1]?.role !== "user") return messages

  const payload = buildBehaviorStatePayload(state)
  const toolCallId = crypto.randomUUID()

  const fakeAssistantMsg: ModelMessage = {
    role: "assistant",
    content: [
      {
        type: "tool-call",
        toolCallId,
        toolName: "get_current_state",
        input: {}
      }
    ]
  }
  const fakeToolMsg: ModelMessage = {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId,
        toolName: "get_current_state",
        output: { type: "json", value: payload }
      }
    ]
  }

  const lastUserIdx = messages.map(m => m.role).lastIndexOf("user")
  const insertAt = lastUserIdx === -1 ? messages.length : lastUserIdx

  return [
    ...messages.slice(0, insertAt),
    fakeAssistantMsg,
    fakeToolMsg,
    ...messages.slice(insertAt)
  ]
}
