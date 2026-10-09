// SPDX-License-Identifier: Apache-2.0

import type { GraphData, GraphMap } from "@entelekheia-ai/cerrado/spec"

/** The classification scheme the adapter writes on every node; routing reads it, never an identifier. */
export const GROUP_SCHEME = "murici.group"

/** Where the territories of one map sit and how big each is. */
const REGION_RADIUS = 320
/** Distance between rings of the slot spiral; neighbouring slots sit about this far apart. */
const SPIRAL_STEP = 850

export interface Territory {
  /** The group key nodes carry in their `murici.group` classification. */
  group: string
  label: string
}

/**
 * The territories of `data`: one per agent node, in agent-id order. The group keys
 * come from the nodes' own classifications, so the map and the adapter cannot disagree.
 */
export function territoriesOf(data: GraphData): Territory[] {
  const groups = new Set<string>()
  const labels = new Map<string, string>()
  for (const node of data.nodes) {
    const group = node.classifications?.find(c => c.scheme === GROUP_SCHEME)?.id
    if (group === undefined) continue
    groups.add(group)
    if (node.type === "agent") labels.set(group, node.label ?? node.id)
  }
  return [...groups]
    .sort((a, b) => a.localeCompare(b))
    .map(group => ({
      group,
      label: labels.get(group) ?? group
    }))
}

function fnv1a(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [
    Math.round(f(0) * 255),
    Math.round(f(8) * 255),
    Math.round(f(4) * 255)
  ]
}

const GOLDEN_ANGLE = 137.508

/**
 * The layout version of the map. It is part of the saved-layout key, and a saved layout hides every change
 * that moves nodes until a reload meets another version, so it is bumped BY HAND whenever the generator or
 * a lens changes where nodes sit (a slot's position, a routing rule, a distortion, a tier). Adding a
 * territory is not such a change: a new region takes a free slot and every existing one stays where it is,
 * so the version does not follow the set of territories. `__tests__/lib/knowledge/map-version.test.ts` pins a
 * digest of everything that moves nodes beside this number and fails until both are updated. History: 3 after the chat lens's repulsion,
 * edge-length and size changes and the lenses' larger nodes.
 */
const MAP_VERSION = 3

/** Territory group key -> the slot it holds. A slot is permanent: it fixes the territory's place and hue. */
export type SlotTable = Record<string, number>

/**
 * Gives every group in `groups` a slot, keeping the ones `table` already holds. A group without a slot
 * takes the lowest free one, in sorted order, so two runs over the same data agree. Slots of groups that
 * left the data stay reserved, so a territory that returns finds its place empty.
 */
export function allocateSlots(
  groups: readonly string[],
  table: SlotTable
): SlotTable {
  const next: SlotTable = { ...table }
  const taken = new Set(Object.values(next))
  let slot = 0
  for (const group of [...groups].sort()) {
    if (next[group] !== undefined) continue
    while (taken.has(slot)) slot++
    next[group] = slot
    taken.add(slot)
  }
  return next
}

/** Slot -> position on a sunflower spiral from the origin: slot 0 at the centre, each further one a ring out. */
function slotPosition(slot: number): { x: number; y: number } {
  const r = SPIRAL_STEP * Math.sqrt(slot)
  const angle = (slot * GOLDEN_ANGLE * Math.PI) / 180
  return {
    x: Math.round(r * Math.cos(angle)),
    y: Math.round(r * Math.sin(angle))
  }
}

/**
 * Builds the map for a graph: one region per territory, each on the spiral slot it holds and with the
 * hue of that slot. Generated like eita's tag map rather than written by hand, because the regions
 * follow the content, and placed by slot rather than by position in the list, so a new territory
 * arrives without moving the others.
 *
 * `slots` must hold every territory of `data`; `allocateSlots` makes it so. `lightPage` picks the
 * lightness of the territories' node colour, which has to read against the page.
 */
export function buildMap(
  data: GraphData,
  slots: SlotTable,
  lightPage = true
): GraphMap {
  const territories = territoriesOf(data)
  const regionId = (group: string): string =>
    `reg_${fnv1a(group).toString(16).padStart(8, "0")}`

  const regions = territories.map(({ group, label }) => {
    const slot = slots[group]
    if (slot === undefined) throw new Error(`buildMap: no slot for ${group}`)
    const hue = (slot * GOLDEN_ANGLE) % 360
    const [r, g, b] = hslToRgb(hue, 0.55, 0.62)
    // The colour of the nodes, their lines and the territory's name: deep on a light page, bright on a dark one.
    const [nr, ng, nb] = hslToRgb(hue, 0.6, lightPage ? 0.42 : 0.56)
    const [dr, dg, db] = hslToRgb(hue, 0.6, 0.3)
    return {
      id: regionId(group),
      label,
      anchor_position: slotPosition(slot),
      radius: REGION_RADIUS,
      color: `#${[nr, ng, nb].map(v => v.toString(16).padStart(2, "0")).join("")}`,
      canopy_gradient: [
        `rgba(${r}, ${g}, ${b}, 0.30)`,
        `rgba(${dr}, ${dg}, ${db}, 0)`
      ]
    }
  })

  return {
    id: "murici_knowledge",
    name: "Murici knowledge",
    version: MAP_VERSION,
    regions,
    routing_rules: territories.map(({ group }) => ({
      match: { scheme: GROUP_SCHEME, id: group },
      assign_to: regionId(group)
    })),
    zoom: { fit_margin: 0.25, max_magnification: 5, elastic: 0.1 }
  }
}
