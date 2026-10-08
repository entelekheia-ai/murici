// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseMap, parseView } from "@entelekheia-ai/cerrado"

import { LENS_SOURCES, MAP_SOURCE } from "@/lib/knowledge/graph/sources"

const dir = join(process.cwd(), "lib/knowledge/graph")

describe("graph sources", () => {
  it("carries the map file's own text", () => {
    expect(MAP_SOURCE).toBe(readFileSync(join(dir, "murici.cmap"), "utf8"))
    expect(parseMap(MAP_SOURCE).id).toBe("murici_knowledge")
  })

  it.each(["default", "chat", "agent"] as const)(
    "carries the %s lens file's own text",
    key => {
      expect(LENS_SOURCES[key]).toBe(
        readFileSync(join(dir, `${key}.cview`), "utf8")
      )
      expect(parseView(LENS_SOURCES[key]).for_map).toBe("murici_knowledge")
    }
  )
})
