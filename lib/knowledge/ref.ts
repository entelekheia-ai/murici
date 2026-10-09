// SPDX-License-Identifier: Apache-2.0

import { build, parse } from "@entelekheia/ref-id"

/** The kind of node a graph identifier names. */
export type GraphRefKind = "conversation" | "knowledge" | "agent"

/** A graph identifier taken apart: its kind and the key the builder was given. */
export interface GraphRef {
  kind: GraphRefKind
  key: string
}

// Conversations and knowledge records exist only in this app's own store, which
// no registered `ref:` type names: they take `unknown` with the app as species.
const COLLECTION_PREFIX: Record<"conversation" | "knowledge", string> = {
  conversation: "murici:conversations/",
  knowledge: "murici:knowledge/"
}

// A dot-agent agent is named by its publisher's namespace, per the four tiers of
// the dot-agent agent-id reference, mapped the way the ref-id specification's
// own vectors map them: a domain or a code-hosting path (Sourcehut's `~user`
// included) is a `url`, an email namespace is an `email` with the agent's name
// as the declared name inside it, and the reserved `unknown` namespace is the
// `dot-agent` species of `unknown`. No version and no digest: the graph draws one
// node per agent, and an unversioned identifier names the living agent.
//
// An agent in the `unknown` namespace has no publisher to tell two of them apart,
// and the dot-agent reference says two such agents with one name are unrelated.
// The location qualifiers do it: `origin=` (the repository it was packaged from)
// and `path=` (the folder it was opened from) each make the identity `distinct`
// in the ref-id verdict when they differ. The agent key carries them in the same
// `;key=value` syntax, after the bare id.
const UNKNOWN_NAMESPACE = "unknown/"
const DOT_AGENT_SPECIES = "dot-agent:"
const LOCATION_KEYS = ["origin", "path"] as const

type BuildParts = Parameters<typeof build>[0]

/** Where an agent was found: its origin repository, or the folder it was opened from. */
export interface AgentLocation {
  origin?: string
  path?: string
}

/**
 * The key `buildAgentLayer` groups agents by, and `agentRef` names: the bare id
 * (`<namespace>/<name>`), plus — for the `unknown` namespace only — the one
 * location that tells it apart, `origin` when known, else `path`.
 */
export function agentKey(
  bareAgentId: string,
  location?: AgentLocation
): string {
  if (!bareAgentId.startsWith(UNKNOWN_NAMESPACE) || !location)
    return bareAgentId
  if (location.origin) return `${bareAgentId};origin=${location.origin}`
  if (location.path) return `${bareAgentId};path=${location.path}`
  return bareAgentId
}

/**
 * The `path=` value for an agent opened from `filePath`: its folder, with `\`
 * as `/` and a Windows drive letter lowercased, the local-path form the
 * ref-id specification declares.
 */
export function agentFolder(filePath: string): string {
  const slashed = filePath.replace(/\\/g, "/")
  const folder = slashed.slice(0, Math.max(slashed.lastIndexOf("/"), 0))
  return folder.replace(
    /^([A-Z]):/,
    (_, drive: string) => `${drive.toLowerCase()}:`
  )
}

function agentParts(key: string): BuildParts {
  const semi = key.indexOf(";")
  const bareAgentId = semi === -1 ? key : key.slice(0, semi)
  if (bareAgentId.startsWith(UNKNOWN_NAMESPACE)) {
    const qualifiers: [string, string][] = []
    if (semi !== -1) {
      const eq = key.indexOf("=", semi)
      qualifiers.push([key.slice(semi + 1, eq), key.slice(eq + 1)])
    }
    return {
      type: "unknown",
      locator: DOT_AGENT_SPECIES + bareAgentId.slice(UNKNOWN_NAMESPACE.length),
      ...(qualifiers.length ? { qualifiers } : {})
    } as BuildParts
  }
  const slash = bareAgentId.indexOf("/")
  const at = bareAgentId.indexOf("@")
  if (at !== -1 && slash !== -1 && at < slash) {
    return {
      type: "email",
      locator: bareAgentId.slice(0, slash),
      fragment: { path: bareAgentId.slice(slash + 1) }
    }
  }
  return { type: "url", locator: bareAgentId }
}

/** The declared name of a fragment with no refinements, else null. */
function fragmentPath(
  fragment: { path: string; refinements: unknown[] } | null
): string | null {
  return fragment && fragment.refinements.length === 0 ? fragment.path : null
}

function partsFor(kind: GraphRefKind, key: string): BuildParts {
  return kind === "agent"
    ? agentParts(key)
    : { type: "unknown", locator: COLLECTION_PREFIX[kind] + key }
}

// Builders run per node per animation frame in the canvas; the parse-back
// check inside `build` is not free, so a built identifier is remembered.
const cache = new Map<string, string>()

function make(kind: GraphRefKind, key: string): string {
  const cacheKey = `${kind}\0${key}`
  const hit = cache.get(cacheKey)
  if (hit !== undefined) return hit
  const id = build(partsFor(kind, key))
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
 * Identifier of an agent node, from the bare agent id (`<namespace>/<name>`, no
 * version, no digest) that `agent-layer.ts` computes:
 * `ref:url:entelekheia.ai/doctor`, `ref:url:sr.ht/~user/fonn`,
 * `ref:email:user@mail.example#doctor`, `ref:unknown:dot-agent:doctor`.
 * Throws on an id no tier admits; check with `canRefAgent` first.
 */
export function agentRef(bareAgentId: string): string {
  return make("agent", bareAgentId)
}

/** True when `agentRef(bareAgentId)` would succeed. Never throws. */
/** True when `make(kind, key)` would succeed. Never throws. */
function canRef(kind: GraphRefKind, key: string): boolean {
  try {
    make(kind, key)
    return true
  } catch {
    return false
  }
}

/**
 * The records both graph renderers draw: every one whose identifiers can be
 * built. A record id or conversation id the locator grammar refuses — none is
 * written by this app, which uses `crypto.randomUUID()`, but a caller may
 * supply one — leaves out that record or bundle instead of throwing, which
 * would blank the whole graph.
 */
export function drawableRecords<
  K extends { id: string; originConversationId: string },
  B extends { conversationId: string }
>(knowledge: K[], agentBundles: B[]): { knowledge: K[]; agentBundles: B[] } {
  return {
    knowledge: knowledge.filter(
      k =>
        canRef("knowledge", k.id) &&
        canRef("conversation", k.originConversationId)
    ),
    agentBundles: agentBundles.filter(b =>
      canRef("conversation", b.conversationId)
    )
  }
}

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
  if (parsed.status !== "ok") return null
  const locator: string = parsed.locator
  if (parsed.type === "url" && parsed.fragment === null) {
    return { kind: "agent", key: locator }
  }
  if (parsed.type === "email") {
    const name = fragmentPath(parsed.fragment)
    return name ? { kind: "agent", key: `${locator}/${name}` } : null
  }
  if (parsed.type !== "unknown") return null
  for (const kind of ["conversation", "knowledge"] as const) {
    const prefix = COLLECTION_PREFIX[kind]
    if (locator.startsWith(prefix) && locator.length > prefix.length) {
      return { kind, key: locator.slice(prefix.length) }
    }
  }
  if (
    locator.startsWith(DOT_AGENT_SPECIES) &&
    locator.length > DOT_AGENT_SPECIES.length
  ) {
    const bare = UNKNOWN_NAMESPACE + locator.slice(DOT_AGENT_SPECIES.length)
    const location: AgentLocation = {}
    for (const [key, value] of parsed.qualifiers as [string, unknown][]) {
      if (!(LOCATION_KEYS as readonly string[]).includes(key)) return null
      if (typeof value !== "string") return null
      location[key as (typeof LOCATION_KEYS)[number]] = value
    }
    return { kind: "agent", key: agentKey(bare, location) }
  }
  return null
}
