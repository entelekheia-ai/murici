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

const loggerErrorMock = jest.fn()
jest.mock("@/lib/logger", () => ({
  logger: { error: (...args: any[]) => loggerErrorMock(...args) }
}))

import { POST } from "./route"

function makeRequest(body: any) {
  return new Request("http://localhost/api/errors/client", {
    method: "POST",
    body: JSON.stringify(body)
  })
}

describe("POST /api/errors/client", () => {
  beforeEach(() => {
    loggerErrorMock.mockClear()
  })

  it("logs a client error report and returns ok", async () => {
    const res = await POST(
      makeRequest({
        message: "Cannot read properties of undefined (reading 'map')",
        stack: "TypeError: ...",
        componentStack: "in Message",
        source: "react-error-boundary",
        url: "http://localhost:3000/local/chat"
      })
    )

    expect(res.status).toBe(200)
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "Client-side error",
      expect.objectContaining({
        message: "Cannot read properties of undefined (reading 'map')",
        source: "react-error-boundary"
      })
    )
  })

  it("returns 400 when message is missing", async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    expect(loggerErrorMock).not.toHaveBeenCalled()
  })
})
