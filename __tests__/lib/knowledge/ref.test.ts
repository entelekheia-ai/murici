// SPDX-License-Identifier: Apache-2.0

import {
  agentFolder,
  agentKey,
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
  })

  // The four namespace tiers of the dot-agent agent-id reference.
  it.each([
    ["entelekheia.ai/doctor", "ref:url:entelekheia.ai/doctor"],
    [
      "github.com/daniloborges/doctor",
      "ref:url:github.com/daniloborges/doctor"
    ],
    ["sr.ht/~reykjalin/fonn", "ref:url:sr.ht/~reykjalin/fonn"],
    ["user@mail.example/doctor", "ref:email:user@mail.example#doctor"],
    ["unknown/doctor", "ref:unknown:dot-agent:doctor"]
  ])("names the agent %s as %s, and parses it back", (bare, ref) => {
    expect(agentRef(bare)).toBe(ref)
    expect(parseGraphRef(ref)).toEqual({ kind: "agent", key: bare })
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
    // A namespace no dot-agent tier admits: not a host, an email or `unknown`.
    expect(() => agentRef("acme/Scribe")).toThrow()
    expect(canRefAgent("acme/Scribe")).toBe(false)
    expect(canRefAgent("entelekheia.ai/doctor")).toBe(true)
  })
})

describe("agents of the unknown namespace", () => {
  it("tells two of one name apart by the folder each was opened from", () => {
    const a = agentKey("unknown/loja", {
      path: agentFolder("/Users/x/Agents/a/loja.agent")
    })
    const b = agentKey("unknown/loja", {
      path: agentFolder("/Users/x/Agents/b/loja.agent")
    })
    expect(agentRef(a)).toBe(
      "ref:unknown:dot-agent:loja;path=/Users/x/Agents/a"
    )
    expect(agentRef(a)).not.toBe(agentRef(b))
    expect(parseGraphRef(agentRef(a))).toEqual({ kind: "agent", key: a })
  })

  it("prefers origin over path, and keeps the bare id with no location", () => {
    expect(
      agentKey("unknown/loja", {
        origin: "https://github.com/a/loja",
        path: "/x"
      })
    ).toBe("unknown/loja;origin=https://github.com/a/loja")
    expect(agentKey("unknown/loja")).toBe("unknown/loja")
  })

  it("adds no location to an agent whose namespace already identifies it", () => {
    expect(agentKey("entelekheia.ai/doctor", { path: "/x" })).toBe(
      "entelekheia.ai/doctor"
    )
  })

  it("writes a Windows folder in the local-path form", () => {
    expect(agentFolder("C:\\Agents\\loja.agent")).toBe("c:/Agents")
  })
})
