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

import { z } from "zod"

export const triggerIntentSchema = z.object({
  intent_name: z.string().describe("The exact intent name to trigger.")
})

export type TriggerIntentArgs = z.infer<typeof triggerIntentSchema>

export async function runTriggerIntent(
  args: TriggerIntentArgs,
  rawToolCall: any
) {
  // We emit an event to the global window so that the chat-ui or orchestrator can pick it up.
  // This maintains the existing event-driven architecture of the FSM.
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("murici:tool_call", {
        detail: {
          intentName: args.intent_name,
          raw: rawToolCall
        }
      })
    )
  }

  // trigger_intent is an ephemeral internal signal, usually returning ok
  return "ok"
}
