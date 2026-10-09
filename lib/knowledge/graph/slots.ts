// SPDX-License-Identifier: Apache-2.0

import type { SlotTable } from "@/lib/knowledge/graph/map"

const SLOTS_KEY = "murici.graph.slots"

/** The slots the graph's territories hold, from `store`; empty when there are none or they are unreadable. */
export function loadSlots(store: Pick<Storage, "getItem">): SlotTable {
  try {
    const parsed: unknown = JSON.parse(store.getItem(SLOTS_KEY) ?? "{}")
    if (parsed === null || typeof parsed !== "object") return {}
    const table: SlotTable = {}
    for (const [group, slot] of Object.entries(parsed)) {
      if (Number.isInteger(slot) && (slot as number) >= 0)
        table[group] = slot as number
    }
    return table
  } catch {
    return {}
  }
}

/** Remembers the slots, so a territory keeps its place the next time the graph is drawn. */
export function saveSlots(
  store: Pick<Storage, "setItem">,
  table: SlotTable
): void {
  try {
    store.setItem(SLOTS_KEY, JSON.stringify(table))
  } catch {
    // Storage full or unavailable: the next draw allocates again, from the first free slot.
  }
}
