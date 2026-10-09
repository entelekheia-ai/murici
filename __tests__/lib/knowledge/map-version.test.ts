// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { yamlFrontEnd } from "@entelekheia-ai/cerrado/spec"
import type { GraphData } from "@entelekheia-ai/cerrado/spec"

import {
  allocateSlots,
  buildMap,
  GROUP_SCHEME
} from "@/lib/knowledge/graph/map"

/**
 * A saved layout hides every change that moves nodes until the map's `version` moves (cerrado keys the
 * layout by `<map id>@<version>/<lens id>`), and nothing else notices the change: the graph just keeps
 * drawing the old positions after a reload. So this test pins a digest of everything that moves nodes —
 * the territories' anchors, radii and routing, and each lens's tiers, hierarchy, distortion and canopy
 * radius — beside the version. Changing any of them fails it.
 *
 * To clear it after an intended change: raise `MAP_VERSION` in `lib/knowledge/graph/map.ts`, then paste
 * the new version and digest below. A colour, a label, the watercolour or the zoom course moves nothing
 * and is not in the digest.
 */
const GEOGRAPHY = { version: 3, digest: "203d0116726a" }

const agent = (id: string): GraphData["nodes"][number] => ({
  id,
  type: "agent",
  label: id,
  classifications: [{ scheme: GROUP_SCHEME, id }]
})

const lens = (key: string) => {
  const raw = yamlFrontEnd.readView(
    readFileSync(
      join(process.cwd(), `lib/knowledge/graph/${key}.cview`),
      "utf8"
    )
  ) as unknown as {
    targets: unknown
    hierarchy: unknown
    distortion: unknown
    paint?: { drop_scale?: number }
  }
  return {
    targets: raw.targets,
    hierarchy: raw.hierarchy,
    distortion: raw.distortion,
    drop_scale: raw.paint?.drop_scale
  }
}

describe("the layout version of the map", () => {
  it("moves whenever a territory or a lens moves nodes", () => {
    const data: GraphData = { nodes: [agent("a"), agent("b")], edges: [] }
    const map = buildMap(data, allocateSlots(["a", "b"], {}))
    const geography = {
      regions: map.regions.map(r => ({
        id: r.id,
        anchor_position: r.anchor_position,
        radius: r.radius,
        mass: r.mass
      })),
      routing_rules: map.routing_rules,
      lenses: ["default", "chat", "agent"].map(lens)
    }
    const digest = createHash("sha1")
      .update(JSON.stringify(geography))
      .digest("hex")
      .slice(0, 12)
    expect({ version: map.version, digest }).toEqual(GEOGRAPHY)
  })
})
