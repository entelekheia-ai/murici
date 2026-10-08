// SPDX-License-Identifier: Apache-2.0

import { render, waitFor } from "@testing-library/react"

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({})
}))
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (s: string) => s })
}))

import { CerradoGraphCanvas } from "@/components/knowledge/cerrado-graph-canvas"

describe("CerradoGraphCanvas", () => {
  it("reports itself unavailable when the browser has no WebGPU", async () => {
    expect((navigator as { gpu?: unknown }).gpu).toBeUndefined()
    const onUnavailable = jest.fn()
    const view = render(
      <CerradoGraphCanvas
        knowledge={[]}
        chats={[]}
        agentBundles={[]}
        onUnavailable={onUnavailable}
      />
    )
    await waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1))
    expect(onUnavailable.mock.calls[0]![0]).toMatch(/gpu/i)
    expect(view.getAllByRole("button").map(b => b.textContent)).toEqual([
      "Default",
      "Chat",
      "Agent"
    ])
  })
})
