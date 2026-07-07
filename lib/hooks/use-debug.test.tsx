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

import React from "react"
import { renderHook } from "@testing-library/react"
import { ChatbotUIContext } from "@/context/context"
import { useDebugSync } from "./use-debug"

function makeWrapper(flowState: any, setFlowDebugLog: (fn: any) => void) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <ChatbotUIContext.Provider value={{ flowState, setFlowDebugLog } as any}>
        {children}
      </ChatbotUIContext.Provider>
    )
  }
}

describe("useDebugSync", () => {
  it("opens a new debug turn when isLoading flips true with an active flowState", () => {
    let log: any = {}
    const setFlowDebugLog = jest.fn(fn => {
      log = fn(log)
    })
    const flowState = { currentState: "greeting", goal: "say hi", validIntents: ["end"] }

    const { rerender } = renderHook(
      ({ isLoading }) => useDebugSync([], isLoading),
      {
        initialProps: { isLoading: false },
        wrapper: makeWrapper(flowState, setFlowDebugLog)
      }
    )

    rerender({ isLoading: true })

    expect(Object.keys(log)).toEqual(["1"])
    expect(log["1"]).toMatchObject({
      sequenceNumber: 1,
      stateAtSend: "greeting",
      goal: "say hi",
      validIntents: ["end"]
    })
  })

  it("records a trigger_intent tool call and the raw response text into the latest turn", () => {
    let log: any = { 1: { sequenceNumber: 1, intentFound: null, rawResponse: "" } }
    const setFlowDebugLog = jest.fn(fn => {
      log = fn(log)
    })

    const message: any = {
      role: "assistant",
      parts: [
        { type: "text", text: "done" },
        {
          type: "tool-trigger_intent",
          toolCallId: "call_1",
          state: "input-available",
          input: { intent_name: "end_conversation" }
        }
      ]
    }

    renderHook(() => useDebugSync([message], true), {
      wrapper: makeWrapper({ currentState: "x" }, setFlowDebugLog)
    })

    expect(log["1"].intentFound).toBe("end_conversation")
    expect(log["1"].rawResponse).toBe("done")
    expect(log["1"].toolExchange).toEqual([
      { role: "tool", content: { toolName: "trigger_intent", args: { intent_name: "end_conversation" }, result: "pending..." } }
    ])
  })

  it("does nothing when there's no active flowState and no tool calls", () => {
    const setFlowDebugLog = jest.fn()
    renderHook(() => useDebugSync([], true), {
      wrapper: makeWrapper(undefined, setFlowDebugLog)
    })
    expect(setFlowDebugLog).not.toHaveBeenCalled()
  })
})
