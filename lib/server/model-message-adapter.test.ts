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
import { buildAiSdkTools } from "./model-message-adapter"

describe("buildAiSdkTools", () => {
  it("returns undefined when there are no raw tools", () => {
    expect(buildAiSdkTools(undefined)).toBeUndefined()
    expect(buildAiSdkTools([])).toBeUndefined()
  })

  it("converts OpenAI-wire function tool descriptors into SDK tool objects", () => {
    const rawTools = [
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get the weather",
          parameters: { type: "object", properties: { city: { type: "string" } } }
        }
      }
    ]
    const tools = buildAiSdkTools(rawTools)
    expect(tools).toBeDefined()
    expect(Object.keys(tools!)).toEqual(["get_weather"])
    expect(tools!.get_weather.description).toBe("Get the weather")
  })

  it("skips entries that aren't function-type tools", () => {
    const rawTools = [{ type: "not-a-function" }]
    const tools = buildAiSdkTools(rawTools)
    expect(tools).toEqual({})
  })
})
