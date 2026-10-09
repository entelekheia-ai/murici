// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  buildScene,
  parseView,
  routeAll,
  validateMap
} from "@entelekheia-ai/cerrado"
import { yamlFrontEnd } from "@entelekheia-ai/cerrado/spec"

import type { GraphData } from "@entelekheia-ai/cerrado/spec"
import { buildGraphData } from "@/lib/knowledge/cerrado-adapter"
import {
  allocateSlots,
  buildMap,
  GROUP_SCHEME,
  territoriesOf
} from "@/lib/knowledge/graph/map"
import type { AgentBundleRecord } from "@/lib/local-db/schema"
import type { Tables } from "@/types/database"
import type { KnowledgeRecord } from "@/types/knowledge"

function record(
  id: string,
  conv: string,
  nodeType: KnowledgeRecord["nodeType"]
): KnowledgeRecord {
  return {
    id,
    nodeType,
    originConversationId: conv,
    messageId: "m",
    sourcePromptMessageId: null,
    title: id,
    summary: null,
    outputType: "GeneralContent",
    payload: { language: "md", content: "" },
    derivedFrom: [],
    agentRuns: [
      { agentId: "acme.example/Scribe:1.0.0~abc", runAt: "x", role: "produced" }
    ],
    createdAt: "2026-01-02T03:04:05.000Z"
  }
}

const data = buildGraphData({
  knowledge: [record("k1", "c1", "document"), record("k2", "c2", "task")],
  agentBundles: [
    {
      conversationId: "c1",
      aboutme: {
        id: "acme.example/Scribe:1.0.0~abc",
        name: "Scribe"
      } as AgentBundleRecord["aboutme"],
      behaviorText: "",
      descriptionText: "",
      knowledge: [],
      guides: [],
      behaviors: [],
      updatedAt: "2026-01-02T03:04:05.000Z"
    }
  ],
  chats: [
    { id: "c1", name: "One" },
    { id: "c2", name: "Two" }
  ] as unknown as Tables<"chats">[]
})

const mapOf = (d: GraphData, table = {}) =>
  buildMap(
    d,
    allocateSlots(
      territoriesOf(d).map(t => t.group),
      table
    )
  )

const agentNode = (id: string): GraphData["nodes"][number] => ({
  id,
  type: "agent",
  label: id,
  classifications: [{ scheme: GROUP_SCHEME, id }]
})

describe("the generated map", () => {
  const map = mapOf(data)

  it("is a valid map", () => {
    expect(() => validateMap(map)).not.toThrow()
  })

  it("gives each agent a territory and leaves the agentless conversations and their knowledge unrouted", () => {
    const names = new Map(map.regions.map(r => [r.id, r.label]))
    const counts = new Map<string | null, number>()
    for (const region of routeAll(data.nodes, map).values()) {
      const name = region === null ? null : names.get(region)!
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    expect(Object.fromEntries(counts)).toEqual({ Scribe: 3, null: 2 })
  })

  it("leaves every existing territory where it was when one is added", () => {
    const one = { nodes: [agentNode("b")], edges: [] }
    const two = { nodes: [agentNode("a"), agentNode("b")], edges: [] }
    const table = allocateSlots(["b"], {})
    const before = buildMap(one, table)
    const after = buildMap(two, allocateSlots(["a", "b"], table))
    const place = (m: typeof before, label: string) =>
      m.regions.find(r => r.label === label)
    // "a" sorts before "b", yet it takes the next free slot rather than the first.
    expect(place(after, "b")).toEqual(place(before, "b"))
    expect(place(after, "a")!.anchor_position).not.toEqual(
      place(after, "b")!.anchor_position
    )
    expect(after.version).toBe(before.version)
  })

  it("keeps the slot of a territory that left, free of reuse", () => {
    const table = allocateSlots(["a", "b"], {})
    expect(allocateSlots(["c"], table).c).toBe(2)
  })
})

describe("murici lenses", () => {
  const map = mapOf(data)
  const read = (lens: string) =>
    readFileSync(
      join(process.cwd(), `lib/knowledge/graph/${lens}.cview`),
      "utf8"
    )

  // Which node type each lens puts in each tier — the lens's whole point.
  const EXPECTED: Record<string, Record<string, string>> = {
    default: {
      tier_high: "conversation",
      tier_medium: "knowledge",
      tier_low: "agent"
    },
    chat: {
      tier_high: "conversation",
      tier_medium: "knowledge",
      tier_low: "agent"
    },
    agent: {
      tier_high: "agent",
      tier_medium: "knowledge",
      tier_low: "conversation"
    }
  }
  const typeOf = new Map(data.nodes.map(n => [n.id, n.type]))

  it.each(Object.keys(EXPECTED))("%s puts each node type in its tier", lens => {
    const scene = buildScene(data, map, parseView(read(lens)))
    const tierTypes: Record<string, Set<string>> = {}
    for (const m of scene.meta) {
      ;(tierTypes[m.tier] ??= new Set()).add(typeOf.get(m.id)!)
    }
    const actual = Object.fromEntries(
      Object.entries(tierTypes).map(([tier, types]) => [
        tier,
        [...types].join(",")
      ])
    )
    expect(actual).toEqual(EXPECTED[lens])
  })

  // Every key the file writes in these blocks survives parsing, at any depth:
  // a misspelt key parses and silently falls back to a default.
  const missingKeys = (
    raw: unknown,
    parsed: unknown,
    path: string
  ): string[] => {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return []
    const out: string[] = []
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const next = (parsed as Record<string, unknown> | undefined)?.[key]
      if (next === undefined) out.push(`${path}.${key}`)
      else out.push(...missingKeys(value, next, `${path}.${key}`))
    }
    return out
  }

  it.each(Object.keys(EXPECTED))("%s keeps every key it writes", lens => {
    const raw = yamlFrontEnd.readView(read(lens)) as unknown as Record<
      string,
      unknown
    >
    const view = parseView(read(lens)) as unknown as Record<string, unknown>
    const missing = ["targets", "distortion", "theme", "paint"].flatMap(block =>
      missingKeys(raw[block], view[block], block)
    )
    expect(missing).toEqual([])
  })
})
