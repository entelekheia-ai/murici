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

/**
 * @jest-environment node
 */

const mockStreamTextResult = {
  toUIMessageStreamResponse: jest.fn(() => new Response("mock-stream"))
}
const streamTextMock = jest.fn((..._args: any[]) => Promise.resolve(mockStreamTextResult))
const createOpenAIMock = jest.fn((..._args: any[]) => (modelId: string) => ({ modelId }))

jest.mock("ai", () => {
  const actual = jest.requireActual("ai")
  return { ...actual, streamText: (...args: any[]) => streamTextMock(...args) }
})

jest.mock("@ai-sdk/openai", () => ({
  createOpenAI: (...args: any[]) => createOpenAIMock(...args)
}))

import { POST } from "./route"

function makeRequest(body: any) {
  return new Request("http://localhost/api/chat/custom", {
    method: "POST",
    body: JSON.stringify(body)
  })
}

describe("POST /api/chat/custom", () => {
  beforeEach(() => {
    streamTextMock.mockClear()
    createOpenAIMock.mockClear()
    mockStreamTextResult.toUIMessageStreamResponse.mockClear()
  })

  it("returns an error response when customModel.base_url is missing", async () => {
    const res = await POST(
      makeRequest({
        chatSettings: { model: "x", temperature: 0.5 },
        messages: [],
        customModel: {}
      })
    )
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.message).toMatch(/base_url is required/i)
    expect(streamTextMock).not.toHaveBeenCalled()
  })

  it("merges built-in tools, MCP tools, and raw wire tools for streamText (Passo 0 contract)", async () => {
    await POST(
      makeRequest({
        chatSettings: { model: "some-model", temperature: 0.5 },
        messages: [{ role: "user", content: "hi" }],
        customModel: {
          base_url: "http://127.0.0.1:8000",
          api_key: "local",
          model_id: "some-model"
        },
        behaviorState: { validIntents: ["end_conversation"] },
        mcpTools: [{ serverName: "s", tools: [{ name: "t", description: "d" }] }],
        tools: [
          {
            type: "function",
            function: { name: "raw_tool", description: "r", parameters: { type: "object", properties: {} } }
          }
        ]
      })
    )

    expect(streamTextMock).toHaveBeenCalledTimes(1)
    const { tools } = streamTextMock.mock.calls[0][0]
    expect(Object.keys(tools).sort()).toEqual(
      ["murici__save_doc", "trigger_intent", "murici__state_graph", "mcp__s__t", "raw_tool"].sort()
    )
  })

  it("normalizes a bare base_url (no /v1) before creating the OpenAI client", async () => {
    await POST(
      makeRequest({
        chatSettings: { model: "some-model", temperature: 0.5 },
        messages: [],
        customModel: { base_url: "http://127.0.0.1:8000", api_key: "local", model_id: "some-model" }
      })
    )
    expect(createOpenAIMock.mock.calls[0][0].baseURL).toBe("http://127.0.0.1:8000/v1")
  })

  it("leaves a base_url that already ends in /v1 untouched (trailing slash trimmed)", async () => {
    await POST(
      makeRequest({
        chatSettings: { model: "some-model", temperature: 0.5 },
        messages: [],
        customModel: { base_url: "http://127.0.0.1:8000/v1/", api_key: "local", model_id: "some-model" }
      })
    )
    expect(createOpenAIMock.mock.calls[0][0].baseURL).toBe("http://127.0.0.1:8000/v1")
  })
})
