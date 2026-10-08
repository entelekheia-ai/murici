// SPDX-License-Identifier: Apache-2.0

import { build, parse } from "@entelekheia/ref-id"

/** The kind of node a graph identifier names. */
export type GraphRefKind = "conversation" | "knowledge" | "agent"

/** A graph identifier taken apart: its kind and the key the builder was given. */
export interface GraphRef {
  kind: GraphRefKind
  key: string
}

// The `unknown` type names an authority the ref-id registry does not cover;
// the first locator segment declares the species, so these stay precise.
const COLLECTION_PREFIX: Record<"conversation" | "knowledge", string> = {
  conversation: "murici:conversations/",
  knowledge: "murici:knowledge/"
}
const AGENT_PREFIX = "dot-agent:"

// Builders run per node per animation frame in the canvas; the parse-back
// check inside `build` is not free, so a built identifier is remembered.
const cache = new Map<string, string>()

function make(kind: GraphRefKind, key: string): string {
  const cacheKey = `${kind}\0${key}`
  const hit = cache.get(cacheKey)
  if (hit !== undefined) return hit
  const prefix = kind === "agent" ? AGENT_PREFIX : COLLECTION_PREFIX[kind]
  const id = build({ type: "unknown", locator: prefix + key })
  const back = parseGraphRef(id)
  if (!back || back.kind !== kind || back.key !== key) {
    throw new Error(`graph identifier does not round-trip: ${kind} ${key}`)
  }
  cache.set(cacheKey, id)
  return id
}

/**
 * Identifier of a conversation node: `ref:unknown:murici:conversations/<chatId>`.
 * Throws (ref-id's `BuildError`) when `chatId` holds a character the locator
 * grammar refuses; the key is never escaped by hand.
 */
export function conversationRef(chatId: string): string {
  return make("conversation", chatId)
}

/**
 * Identifier of a knowledge-record node: `ref:unknown:murici:knowledge/<recordId>`.
 * Throws on a key the locator grammar refuses.
 */
export function knowledgeRef(recordId: string): string {
  return make("knowledge", recordId)
}

/**
 * Identifier of an agent node: `ref:unknown:dot-agent:<namespace>/<name>`,
 * from the bare agent id (no version, no digest) that `agent-layer.ts` computes.
 * Throws on an id the locator grammar refuses — notably a Sourcehut namespace,
 * whose `~` the grammar does not admit; check with `canRefAgent` first.
 */
export function agentRef(bareAgentId: string): string {
  return make("agent", bareAgentId)
}

/** True when `agentRef(bareAgentId)` would succeed. Never throws. */
export function canRefAgent(bareAgentId: string): boolean {
  try {
    agentRef(bareAgentId)
    return true
  } catch {
    return false
  }
}

/**
 * Takes a graph identifier apart. Returns null for anything that is not a
 * well-formed `ref:` identifier built by this module — another type, another
 * collection, a malformed string — and never throws.
 */
export function parseGraphRef(id: string): GraphRef | null {
  let parsed
  try {
    parsed = parse(id)
  } catch {
    return null
  }
  if (parsed.status !== "ok" || parsed.type !== "unknown") return null
  const locator = parsed.locator
  for (const kind of ["conversation", "knowledge"] as const) {
    const prefix = COLLECTION_PREFIX[kind]
    if (locator.startsWith(prefix) && locator.length > prefix.length) {
      return { kind, key: locator.slice(prefix.length) }
    }
  }
  if (
    locator.startsWith(AGENT_PREFIX) &&
    locator.length > AGENT_PREFIX.length
  ) {
    return { kind: "agent", key: locator.slice(AGENT_PREFIX.length) }
  }
  return null
}
