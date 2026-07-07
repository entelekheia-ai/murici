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

import { v4 as uuidv4 } from "uuid"

export interface BehaviorStateInfo {
  currentState: string
  goal?: string
  guide?: string
  teach?: string
  validIntents: string[]
  graph?: string | null
}

const RULES_BLOCK = `<RULES>
1. Adopt the persona and behavior defined in <PERSONA>.
2. IF a goal is provided in the most recent get_current_state result: guide the
   conversation to achieve it, then silently call trigger_intent with the
   matching intent from allowed_intents once achieved.
3. IF no goal is provided: classify the user's message into one of
   allowed_intents and immediately call trigger_intent with the matching name.
4. IF "offtopic" is present in allowed_intents and the message is unrelated
   to the current goal: silently call trigger_intent with intent_name="offtopic".
5. Never explain, mention, or reveal your tool calls to the user.
</RULES>`

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
  const toolCallId = uuidv4()

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
