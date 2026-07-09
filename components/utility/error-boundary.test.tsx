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

const loggerErrorMock = jest.fn()
jest.mock("@/lib/logger", () => ({
  logger: { error: (...args: any[]) => loggerErrorMock(...args) }
}))

import { render, screen } from "@testing-library/react"
import { ErrorBoundary } from "./error-boundary"

function Bomb(): JSX.Element {
  throw new Error("boom")
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    loggerErrorMock.mockClear()
    // React logs the caught error to console.error too; keep test output clean.
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    ;(console.error as jest.Mock).mockRestore()
  })

  it("renders children normally when nothing throws", () => {
    render(
      <ErrorBoundary>
        <div>fine</div>
      </ErrorBoundary>
    )
    expect(screen.getByText("fine")).toBeInTheDocument()
    expect(loggerErrorMock).not.toHaveBeenCalled()
  })

  it("catches a render crash, shows a fallback, and reports it via logger.error", () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )

    expect(screen.getByText("Algo deu errado")).toBeInTheDocument()
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "boom",
      expect.objectContaining({ source: "react-error-boundary" })
    )
  })
})
