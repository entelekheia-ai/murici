/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import type { ModelMessage } from "ai"
import {
  injectBehaviorContextModelMessages,
  type BehaviorStateInfo
} from "./dot-agent-injector"

const state: BehaviorStateInfo = {
  currentState: "show_catalog",
  goal: "Display the full list of recipes.",
  guide: "List every recipe.",
  validIntents: ["Start over", "Out of scope", "offtopic"]
}

const getStatePair = (msgs: ModelMessage[]) =>
  msgs.filter(
    m =>
      Array.isArray((m as any).content) &&
      (m as any).content.some(
        (p: any) =>
          p?.toolName === "get_current_state" &&
          (p.type === "tool-call" || p.type === "tool-result")
      )
  )

describe("injectBehaviorContextModelMessages", () => {
  it("returns messages untouched when there is no active FSM state", () => {
    const msgs: ModelMessage[] = [{ role: "user", content: "hi" }]
    expect(injectBehaviorContextModelMessages(msgs, null)).toBe(msgs)
    expect(
      injectBehaviorContextModelMessages(msgs, { currentState: "" } as any)
    ).toBe(msgs)
  })

  it("first turn: splices the state check right BEFORE the last user message", () => {
    const msgs: ModelMessage[] = [
      { role: "assistant", content: "earlier reply" },
      { role: "user", content: "oi, quero ver a lista" }
    ]
    const out = injectBehaviorContextModelMessages(msgs, state)

    // Two injected messages (assistant get_current_state call + tool result).
    expect(getStatePair(out)).toHaveLength(2)
    // The user's message stays LAST (agent checks state, then reads the user).
    expect(out[out.length - 1]).toEqual(msgs[1])
    // Injection sits immediately before that user message.
    expect((out[out.length - 2] as any).content[0].type).toBe("tool-result")
    expect((out[out.length - 3] as any).content[0].type).toBe("tool-call")
  })

  it("resubmit turn: does NOT re-inject (state already rides in the tool-result; keeps cache warm)", () => {
    // Conversation ends with the trigger_intent tool-result. We deliberately do
    // NOT re-assert state here: measured against the real model, it answers with
    // text and never re-fires at this point, so re-injecting would only cost
    // prompt cache. The duplication was the client double-resubmit race (fixed by
    // the one-shot guard), not prompt salience. See project/adr/0004 log §8–9.
    const msgs: ModelMessage[] = [
      { role: "user", content: "oi, quero ver a lista" },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_x",
            toolName: "trigger_intent",
            input: { intent_name: "List recipes" }
          }
        ]
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_x",
            toolName: "trigger_intent",
            output: { type: "json", value: { state: "show_catalog" } }
          }
        ]
      }
    ]
    const out = injectBehaviorContextModelMessages(msgs, state)

    // Untouched: no get_current_state pair spliced in on a resubmit turn.
    expect(out).toBe(msgs)
    expect(getStatePair(out)).toHaveLength(0)
  })
})
