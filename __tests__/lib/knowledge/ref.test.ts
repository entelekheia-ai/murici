// SPDX-License-Identifier: Apache-2.0

import {
  agentRef,
  canRefAgent,
  conversationRef,
  knowledgeRef,
  parseGraphRef
} from "@/lib/knowledge/ref"

describe("graph identifiers", () => {
  it("builds the three identifier shapes", () => {
    expect(conversationRef("c-1")).toBe("ref:unknown:murici:conversations/c-1")
    expect(knowledgeRef("k_2")).toBe("ref:unknown:murici:knowledge/k_2")
    expect(agentRef("acme/Scribe")).toBe("ref:unknown:dot-agent:acme/Scribe")
  })

  it("round-trips every kind through parseGraphRef", () => {
    expect(parseGraphRef(conversationRef("c-1"))).toEqual({
      kind: "conversation",
      key: "c-1"
    })
    expect(parseGraphRef(knowledgeRef("k_2"))).toEqual({
      kind: "knowledge",
      key: "k_2"
    })
    expect(parseGraphRef(agentRef("acme/Scribe"))).toEqual({
      kind: "agent",
      key: "acme/Scribe"
    })
  })

  it("returns null for strings that are not graph identifiers", () => {
    expect(parseGraphRef("conv-c-1")).toBeNull()
    expect(parseGraphRef("ref:pkg:npm/x@1.0.0")).toBeNull()
    expect(parseGraphRef("ref:unknown:murici:other/x")).toBeNull()
    expect(parseGraphRef("")).toBeNull()
  })

  it("refuses a key the locator grammar cannot carry, instead of escaping it", () => {
    expect(() => conversationRef("a;b")).toThrow()
    expect(() => knowledgeRef("")).toThrow()
    expect(() => agentRef("~sourcehut/Scribe")).toThrow()
    expect(canRefAgent("~sourcehut/Scribe")).toBe(false)
    expect(canRefAgent("acme/Scribe")).toBe(true)
  })
})
