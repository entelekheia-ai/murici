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

// The route wraps the model stream in createUIMessageStream (to emit the
// data-debug part) and merges result.toUIMessageStream() into it, so that's the
// method the mock must expose now.
const mockStreamTextResult = {
  toUIMessageStream: jest.fn(
    () =>
      new ReadableStream({
        start(controller) {
          controller.close()
        }
      })
  ),
  toUIMessageStreamResponse: jest.fn(() => new Response("mock-stream"))
}
const streamTextMock = jest.fn((..._args: any[]) =>
  Promise.resolve(mockStreamTextResult)
)
// The route calls custom.chat(model) to force the /v1/chat/completions endpoint
// (where local reasoning models surface reasoning_content), so the provider the
// mock returns must expose a .chat() alongside being directly callable.
const createOpenAIMock = jest.fn((..._args: any[]) => {
  const provider = (modelId: string) => ({ modelId })
  ;(provider as any).chat = (modelId: string) => ({ modelId })
  return provider
})

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

  it("accepts real UIMessage[] payloads from useChat (parts-based, not OpenAI-wire) without AI_InvalidPromptError", async () => {
    // Regression test: useChat/DefaultChatTransport sends UIMessage[] (id +
    // role + parts), not the old OpenAI-wire {role, content} shape. The route
    // must run these through the real (unmocked) convertToModelMessages, not
    // a hand-rolled adapter built for the wrong input shape.
    const res = await POST(
      makeRequest({
        chatSettings: { model: "some-model", temperature: 0.5 },
        messages: [
          {
            id: "CjmSkw7b2BQ9fng1",
            role: "user",
            parts: [{ type: "text", text: "gera um email" }]
          }
        ],
        customModel: {
          base_url: "http://127.0.0.1:8000",
          api_key: "local",
          model_id: "some-model"
        }
      })
    )

    expect(res.status).not.toBe(500)
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    const { messages } = streamTextMock.mock.calls[0][0]
    expect(messages).toEqual([
      { role: "user", content: [{ type: "text", text: "gera um email" }] }
    ])
  })

  it("merges built-in tools, MCP tools, and raw wire tools for streamText (Passo 0 contract)", async () => {
    await POST(
      makeRequest({
        chatSettings: { model: "some-model", temperature: 0.5 },
        messages: [
          { id: "msg_1", role: "user", parts: [{ type: "text", text: "hi" }] }
        ],
        customModel: {
          base_url: "http://127.0.0.1:8000",
          api_key: "local",
          model_id: "some-model"
        },
        behaviorState: { validIntents: ["end_conversation"] },
        mcpTools: [
          { serverName: "s", tools: [{ name: "t", description: "d" }] }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "raw_tool",
              description: "r",
              parameters: { type: "object", properties: {} }
            }
          }
        ]
      })
    )

    expect(streamTextMock).toHaveBeenCalledTimes(1)
    const { tools } = streamTextMock.mock.calls[0][0]
    expect(Object.keys(tools).sort()).toEqual(
      [
        "murici__save_doc",
        "trigger_intent",
        "murici__state_graph",
        "mcp__s__t",
        "raw_tool"
      ].sort()
    )
  })

  it("normalizes a bare base_url (no /v1) before creating the OpenAI client", async () => {
    await POST(
      makeRequest({
        chatSettings: { model: "some-model", temperature: 0.5 },
        messages: [],
        customModel: {
          base_url: "http://127.0.0.1:8000",
          api_key: "local",
          model_id: "some-model"
        }
      })
    )
    expect(createOpenAIMock.mock.calls[0][0].baseURL).toBe(
      "http://127.0.0.1:8000/v1"
    )
  })

  it("leaves a base_url that already ends in /v1 untouched (trailing slash trimmed)", async () => {
    await POST(
      makeRequest({
        chatSettings: { model: "some-model", temperature: 0.5 },
        messages: [],
        customModel: {
          base_url: "http://127.0.0.1:8000/v1/",
          api_key: "local",
          model_id: "some-model"
        }
      })
    )
    expect(createOpenAIMock.mock.calls[0][0].baseURL).toBe(
      "http://127.0.0.1:8000/v1"
    )
  })
})
