// SPDX-License-Identifier: Apache-2.0

import { act, render } from "@testing-library/react"

let unavailable: ((reason: string) => void) | undefined
jest.mock("@/components/knowledge/cerrado-graph-canvas", () => ({
  CerradoGraphCanvas: (p: { onUnavailable: (r: string) => void }) => {
    unavailable = p.onUnavailable
    return <div data-testid="cerrado" />
  }
}))
jest.mock("@/components/knowledge/knowledge-graph-canvas", () => ({
  KnowledgeGraphCanvas: (p: { knowledge: unknown[] }) => (
    <div data-testid="vis">{p.knowledge.length}</div>
  )
}))

import { KnowledgeGraph } from "@/components/knowledge/knowledge-graph"

describe("KnowledgeGraph", () => {
  it("draws with cerrado, and falls back to vis-network when it is unavailable", () => {
    const view = render(
      <KnowledgeGraph
        knowledge={[{ id: "k" } as never]}
        chats={[]}
        agentBundles={[]}
      />
    )
    expect(view.queryByTestId("vis")).toBeNull()
    expect(view.getByTestId("cerrado").tagName).toBe("DIV")
    act(() => unavailable?.("no WebGPU"))
    expect(view.queryByTestId("cerrado")).toBeNull()
    expect(view.getByTestId("vis").textContent).toBe("1")
  })
})
