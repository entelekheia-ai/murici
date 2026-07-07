/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @jest-environment node
 */
import { getBuiltInTools, mapMcpTools } from "./registry"

describe("getBuiltInTools", () => {
  it("always includes murici__save_doc, even without a behaviorState", () => {
    const tools = getBuiltInTools(undefined)
    expect(Object.keys(tools)).toEqual(["murici__save_doc"])
  })

  it("adds trigger_intent and murici__state_graph when validIntents are present", () => {
    const tools = getBuiltInTools({ validIntents: ["end_conversation"] } as any)
    expect(Object.keys(tools).sort()).toEqual(
      ["murici__save_doc", "murici__state_graph", "trigger_intent"].sort()
    )
  })

  it("does not add the intent tools when validIntents is empty/absent", () => {
    const tools = getBuiltInTools({ validIntents: undefined } as any)
    expect(Object.keys(tools)).toEqual(["murici__save_doc"])
  })

  it("built-in tools use tool(), not dynamicTool() (no `type: dynamic` field)", () => {
    const tools = getBuiltInTools(undefined)
    expect((tools.murici__save_doc as any).type).toBeUndefined()
  })
})

describe("mapMcpTools", () => {
  it("namespaces MCP tools as mcp__<server>__<tool>", () => {
    const tools = mapMcpTools([
      {
        serverName: "myserver",
        tools: [{ name: "do_thing", description: "does a thing" }]
      }
    ])
    expect(Object.keys(tools)).toEqual(["mcp__myserver__do_thing"])
    expect(tools["mcp__myserver__do_thing"].description).toBe("does a thing")
  })

  it("uses dynamicTool() (marks `type: dynamic`) since MCP schemas are only known at runtime", () => {
    const tools = mapMcpTools([
      { serverName: "s", tools: [{ name: "t", description: "" }] }
    ])
    expect((tools["mcp__s__t"] as any).type).toBe("dynamic")
  })

  it("returns an empty object for an empty server list", () => {
    expect(mapMcpTools([])).toEqual({})
  })
})
