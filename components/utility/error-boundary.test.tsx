// SPDX-License-Identifier: Apache-2.0

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

    expect(screen.getByText("Something went wrong")).toBeInTheDocument()
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "boom",
      expect.objectContaining({ source: "react-error-boundary" })
    )
  })
})
