// SPDX-License-Identifier: Apache-2.0

import { act, render, renderHook } from "@testing-library/react"

import { agentRef, conversationRef, knowledgeRef } from "@/lib/knowledge/ref"
import type { AgentBundleRecord } from "@/lib/local-db/schema"
import type { Tables } from "@/types/database"
import type { KnowledgeRecord } from "@/types/knowledge"

const push = jest.fn()
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ locale: "en", workspaceid: "local" })
}))
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (s: string) => s })
}))
jest.mock("@/components/knowledge/knowledge-preview-modal", () => ({
  KnowledgePreviewModal: (p: {
    record: { title: string }
    chatName: string
  }) => <div data-testid="preview">{`${p.record.title}|${p.chatName}`}</div>
}))

import { useGraphClick } from "@/components/knowledge/use-graph-click"

const AGENT_ID = "acme.example/Scribe:1.0.0~abc"
const knowledge = [
  {
    id: "k1",
    nodeType: "document",
    originConversationId: "c1",
    title: "Doc",
    agentRuns: [{ agentId: AGENT_ID, runAt: "x", role: "produced" }]
  }
] as unknown as KnowledgeRecord[]
const chats = [{ id: "c1", name: "My chat" }] as unknown as Tables<"chats">[]
const agentBundles = [
  {
    conversationId: "c1",
    aboutme: { id: AGENT_ID, name: "Scribe" }
  }
] as unknown as AgentBundleRecord[]

function setup() {
  const hook = renderHook(() =>
    useGraphClick({ knowledge, chats, agentBundles })
  )
  const overlay = () => render(<>{hook.result.current.overlay}</>)
  return { hook, overlay }
}

describe("useGraphClick", () => {
  beforeEach(() => push.mockClear())

  it("pushes the chat route for a conversation", () => {
    const { hook } = setup()
    act(() => hook.result.current.onNodeClick(conversationRef("c1")))
    expect(push).toHaveBeenCalledWith("/en/local/chat/c1")
  })

  it("opens the preview for a knowledge record", () => {
    const { hook, overlay } = setup()
    act(() => hook.result.current.onNodeClick(knowledgeRef("k1")))
    expect(overlay().getByTestId("preview").textContent).toBe("Doc|My chat")
    expect(push).not.toHaveBeenCalled()
  })

  it("opens the agent overlay for an agent", () => {
    const { hook, overlay } = setup()
    act(() => hook.result.current.onNodeClick(agentRef("acme.example/Scribe")))
    const view = overlay()
    expect(view.getByText("Scribe").tagName).toBe("H3")
    expect(view.getByText("1 conversa(s), 1 artefato(s)").tagName).toBe("P")
  })

  it("ignores an identifier that is not a graph reference", () => {
    const { hook, overlay } = setup()
    act(() => hook.result.current.onNodeClick("nope"))
    expect(push).not.toHaveBeenCalled()
    expect(overlay().queryByTestId("preview")).toBeNull()
  })
})
