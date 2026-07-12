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

import { serializeStreamError, parseStreamError } from "./api-error"

describe("serializeStreamError", () => {
  it("captures every APICallError field when present", () => {
    const error = {
      message: "Your credit balance is too low to access the Anthropic API.",
      statusCode: 400,
      responseHeaders: { "cf-ray": "abc123" },
      responseBody: '{"type":"error"}',
      data: { type: "error", error: { type: "invalid_request_error" } },
      isRetryable: false,
      url: "https://api.anthropic.com/v1/messages"
    }

    const parsed = JSON.parse(serializeStreamError(error))
    expect(parsed).toEqual(error)
  })

  it("only carries the message for a plain Error", () => {
    const parsed = JSON.parse(serializeStreamError(new Error("boom")))
    expect(parsed.message).toBe("boom")
    expect(parsed.statusCode).toBeUndefined()
    expect(parsed.responseBody).toBeUndefined()
  })

  it("falls back to a generic message when the error has none", () => {
    const parsed = JSON.parse(serializeStreamError({}))
    expect(parsed.message).toBe(
      "An error occurred while streaming the response."
    )
  })
})

describe("parseStreamError", () => {
  it("round-trips everything serializeStreamError produced", () => {
    const error = {
      message: "insufficient_quota",
      statusCode: 429,
      isRetryable: true
    }
    const raw = serializeStreamError(error)
    expect(parseStreamError(raw)).toEqual({
      message: "insufficient_quota",
      statusCode: 429,
      responseHeaders: undefined,
      responseBody: undefined,
      data: undefined,
      isRetryable: true,
      url: undefined
    })
  })

  it("falls back to treating the raw string as the message when it isn't JSON", () => {
    expect(parseStreamError("An error occurred.")).toEqual({
      message: "An error occurred."
    })
  })

  it("falls back when the JSON parses but isn't a StreamErrorDetails shape", () => {
    expect(parseStreamError('{"foo":"bar"}')).toEqual({
      message: '{"foo":"bar"}'
    })
  })
})
