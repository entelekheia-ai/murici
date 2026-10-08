// SPDX-License-Identifier: Apache-2.0

import { buildGraphData } from "@/lib/knowledge/cerrado-adapter"
import {
  agentRef,
  conversationRef,
  knowledgeRef,
  parseGraphRef
} from "@/lib/knowledge/ref"
import type { AgentBundleRecord } from "@/lib/local-db/schema"
import type { Tables } from "@/types/database"
import type { KnowledgeRecord } from "@/types/knowledge"

function record(
  id: string,
  conv: string,
  overrides: Partial<KnowledgeRecord> = {}
): KnowledgeRecord {
  return {
    id,
    nodeType: "document",
    originConversationId: conv,
    messageId: "m",
    sourcePromptMessageId: null,
    title: `Title of ${id}`,
    summary: null,
    outputType: "GeneralContent",
    payload: { language: "md", content: "" },
    derivedFrom: [],
    agentRuns: [],
    createdAt: "2026-01-02T03:04:05.000Z",
    ...overrides
  }
}

function bundle(conv: string, id: string, name: string): AgentBundleRecord {
  return {
    conversationId: conv,
    aboutme: { id, name } as AgentBundleRecord["aboutme"],
    behaviorText: "",
    descriptionText: "",
    knowledge: [],
    guides: [],
    behaviors: [],
    updatedAt: "2026-01-02T03:04:05.000Z"
  }
}

const chats = [
  { id: "c1", name: "First chat", created_at: "2026-01-01T00:00:00.000Z" },
  { id: "c2", name: "Second chat", created_at: "2026-01-01T00:00:00.000Z" },
  { id: "unused", name: "Never shown", created_at: "2026-01-01T00:00:00.000Z" }
] as unknown as Tables<"chats">[]

const knowledge = [
  record("k1", "c1", {
    agentRuns: [
      { agentId: "acme/Scribe:1.0.0~abc123", runAt: "x", role: "produced" },
      {
        agentId: "acme/BackgroundSystem:1.0.0~def",
        runAt: "x",
        role: "consumed"
      },
      { agentId: "~sr/Hermit:2.0.0~zzz", runAt: "x", role: "produced" }
    ]
  }),
  record("k2", "c2", { nodeType: "task" })
]

const agentBundles = [
  bundle("c1", "acme/Scribe:1.0.0~abc123", "Scribe"),
  bundle("c2", "acme/Scribe:1.1.0~fff999", "Scribe"),
  bundle("c2", "acme/BackgroundSystem:1.0.0~def", "BackgroundSystem"),
  bundle("c2", "~sr/Hermit:2.0.0~zzz", "Hermit")
]

describe("buildGraphData", () => {
  const data = buildGraphData({ knowledge, agentBundles, chats })
  const byId = new Map(data.nodes.map(n => [n.id, n]))

  it("emits one node per shown conversation, record and visible agent", () => {
    expect(data.nodes.map(n => n.type).sort()).toEqual([
      "agent",
      "conversation",
      "conversation",
      "knowledge",
      "knowledge"
    ])
    expect(byId.has(conversationRef("unused"))).toBe(false)
  })

  it("keeps the record's own nodeType in attrs and labels untruncated", () => {
    const k2 = byId.get(knowledgeRef("k2"))!
    expect(k2.attrs).toEqual({ nodeType: "task" })
    expect(k2.label).toBe("Title of k2")
    expect(k2.createdAt).toBe(Date.parse("2026-01-02T03:04:05.000Z"))
    expect(byId.get(conversationRef("c1"))!.label).toBe("First chat")
  })

  it("names an agent once by its unversioned id, whatever build produced it", () => {
    const scribe = byId.get(agentRef("acme/Scribe"))!
    expect(scribe.label).toBe("Scribe")
    expect(data.nodes.filter(n => n.type === "agent")).toHaveLength(1)
    expect(parseGraphRef(scribe.id)).toEqual({
      kind: "agent",
      key: "acme/Scribe"
    })
  })

  it("keeps the hidden BackgroundSystem agent out", () => {
    expect(data.nodes.some(n => n.id.includes("BackgroundSystem"))).toBe(false)
    expect(data.edges.some(e => e.from.includes("BackgroundSystem"))).toBe(
      false
    )
  })

  it("leaves out an agent whose namespace the locator grammar refuses, with its edges", () => {
    expect(data.nodes.some(n => n.label === "Hermit")).toBe(false)
    expect(data.edges.every(e => !e.from.includes("Hermit"))).toBe(true)
  })

  it("draws the three edge types the vis-network canvas draws", () => {
    const edge = (from: string, to: string) =>
      data.edges.find(e => e.from === from && e.to === to)?.type
    expect(edge(knowledgeRef("k1"), conversationRef("c1"))).toBe("generated_in")
    expect(edge(agentRef("acme/Scribe"), conversationRef("c1"))).toBe("ran_in")
    expect(edge(agentRef("acme/Scribe"), conversationRef("c2"))).toBe("ran_in")
    expect(edge(agentRef("acme/Scribe"), knowledgeRef("k1"))).toBe("produced")
    expect(data.edges).toHaveLength(5)
  })

  it("references only nodes that exist", () => {
    for (const e of data.edges) {
      expect(byId.has(e.from)).toBe(true)
      expect(byId.has(e.to)).toBe(true)
    }
  })
})
