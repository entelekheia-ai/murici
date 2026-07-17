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

import { runHeadlessAgent } from "./headless-runner"
import { LLM } from "@/types"

jest.mock("@/lib/kernel-proxy", () => ({
  KernelProxy: jest.fn().mockImplementation(() => ({
    load_behavior: jest.fn().mockResolvedValue([]),
    inject_memory: jest.fn().mockResolvedValue([]),
    get_current_state: jest.fn().mockReturnValue("translate"),
    send_intent: jest
      .fn()
      .mockResolvedValue([{ type: "goal", text: "Translate the content." }]),
    destroy: jest.fn()
  }))
}))

function makeModel(): LLM {
  return {
    modelId: "llama3",
    modelName: "llama3",
    provider: "local",
    hostedId: "llama3",
    platformLink: "",
    imageInput: false
  } as LLM
}

function mockFetchSequence(chatCompletionBody: any) {
  return (
    jest
      .fn()
      // 1. GET the .agent bundle
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(["fake-agent-bytes"])
      })
      // 2. POST /api/agent/unpack
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ behaviorText: "state translate\n  interact" })
      })
      // 3. POST the chat completion
      .mockResolvedValueOnce({
        ok: true,
        json: async () => chatCompletionBody
      })
  )
}

describe("runHeadlessAgent", () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  // Each test uses its own agentUrl: runHeadlessAgent caches the unpacked
  // behaviorText per agentUrl at module scope, so reusing the same URL across
  // tests would let a later test silently skip the fetch/unpack steps and
  // consume the wrong queued mock response.

  it("includes the caller's jsonInstruction in the system prompt sent to the model", async () => {
    const fetchMock = mockFetchSequence({
      choices: [
        {
          message: {
            content:
              '{"intent_name":"save_translation","translated":"Cota insuficiente."}'
          }
        }
      ]
    })
    global.fetch = fetchMock as any

    const instruction =
      'Respond ONLY as JSON: { "intent_name": "save_translation", "translated": "..." }'
    await runHeadlessAgent(
      "Insufficient quota.",
      makeModel(),
      "/agents/background.agent?test=prompt",
      "run_translation",
      instruction
    )

    const chatCall = fetchMock.mock.calls[2]
    const body = JSON.parse(chatCall[1].body)
    expect(body.messages[0].content).toContain(instruction)
  })

  it("accepts a response field that isn't title/summary (e.g. translated)", async () => {
    global.fetch = mockFetchSequence({
      choices: [
        {
          message: {
            content:
              '{"intent_name":"save_translation","translated":"Cota insuficiente."}'
          }
        }
      ]
    }) as any

    const result = await runHeadlessAgent(
      "Insufficient quota.",
      makeModel(),
      "/agents/background.agent?test=field",
      "run_translation",
      'Respond ONLY as JSON: { "intent_name": "save_translation", "translated": "..." }'
    )

    expect(result?.translated).toBe("Cota insuficiente.")
  })
})
