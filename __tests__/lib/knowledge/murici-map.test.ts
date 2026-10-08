// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  buildScene,
  parseMap,
  parseView,
  routeAll
} from "@entelekheia-ai/cerrado"
import { yamlFrontEnd } from "@entelekheia-ai/cerrado/spec"

import { buildGraphData } from "@/lib/knowledge/cerrado-adapter"
import type { AgentBundleRecord } from "@/lib/local-db/schema"
import type { Tables } from "@/types/database"
import type { KnowledgeRecord } from "@/types/knowledge"

const MAP_PATH = join(process.cwd(), "lib/knowledge/graph/murici.cmap")
const source = readFileSync(MAP_PATH, "utf8")

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
      { agentId: "acme/Scribe:1.0.0~abc", runAt: "x", role: "produced" }
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
        id: "acme/Scribe:1.0.0~abc",
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

describe("murici.cmap", () => {
  const map = parseMap(source)

  it("routes every node kind to its own territory, leaving none unrouted", () => {
    const counts = new Map<string | null, number>()
    for (const region of routeAll(data.nodes, map).values()) {
      counts.set(region, (counts.get(region) ?? 0) + 1)
    }
    expect(Object.fromEntries(counts)).toEqual({
      reg_agents: 1,
      reg_conversations: 2,
      reg_knowledge: 2
    })
  })

  it("keeps every key the file writes", () => {
    const raw = yamlFrontEnd.readMap(source) as unknown as {
      regions: Record<string, unknown>[]
      zoom: Record<string, unknown>
    }
    raw.regions.forEach((region, i) => {
      for (const key of Object.keys(region)) {
        expect(map.regions[i]).toHaveProperty(key)
      }
    })
    for (const key of Object.keys(raw.zoom)) {
      expect(map.zoom).toHaveProperty(key)
    }
  })
})

describe("murici lenses", () => {
  const map = parseMap(source)
  const LENSES = ["default", "chat", "agent"] as const
  const read = (lens: string) =>
    readFileSync(
      join(process.cwd(), `lib/knowledge/graph/${lens}.cview`),
      "utf8"
    )

  it.each(LENSES)("%s parses, and every tier holds a node", lens => {
    const scene = buildScene(data, map, parseView(read(lens)))
    const tiers = new Map<string, number>()
    for (const m of scene.meta) tiers.set(m.tier, (tiers.get(m.tier) ?? 0) + 1)
    expect([...tiers.keys()].sort()).toEqual([
      "tier_high",
      "tier_low",
      "tier_medium"
    ])
  })

  it("draws the same nodes and edges in every lens, so a switch can morph", () => {
    const scenes = LENSES.map(lens =>
      buildScene(data, map, parseView(read(lens)))
    )
    const ids = scenes.map(s => s.meta.map(m => m.id).join("|"))
    expect(new Set(ids).size).toBe(1)
    expect(new Set(scenes.map(s => s.edges.length)).size).toBe(1)
  })

  it.each(LENSES)(
    "%s keeps every top-level and distortion key it writes",
    lens => {
      const raw = yamlFrontEnd.readView(read(lens)) as unknown as Record<
        string,
        unknown
      >
      const view = parseView(read(lens)) as unknown as Record<
        string,
        Record<string, unknown>
      >
      for (const key of Object.keys(raw)) expect(view).toHaveProperty(key)
      const distortion = raw.distortion as Record<
        string,
        Record<string, unknown>
      >
      for (const [tier, knobs] of Object.entries(distortion)) {
        for (const knob of Object.keys(knobs))
          expect(view.distortion[tier]).toHaveProperty(knob)
      }
    }
  )
})
