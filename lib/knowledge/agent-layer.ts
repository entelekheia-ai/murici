/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import { KnowledgeRecord } from "@/types/knowledge"
import { AgentBundleRecord } from "@/lib/local-db/schema"

export interface AgentLayerNode {
  agentId: string
  name: string
  conversationIds: Set<string>
  artifactIds: Set<string>
  interactionCount: number
}

// Bare form (namespace/name) per dot-agent-spec's agent-id.md: an agent ID
// is `namespace/name:version~digest`, and the digest changes on every
// repack. Deduping the graph on the full ID would give the same agent one
// node per build/version it was ever loaded as — the graph only cares
// about identity (namespace/name), not which specific build produced a
// given artifact. Splitting on the FIRST `:` is deliberate: Sourcehut
// namespaces embed a `~` in the username (before the `:`), so a naive
// split on `~` would misparse those — see the spec's own parsing order.
function bareAgentId(fullId: string): string {
  const colonIdx = fullId.indexOf(":")
  return colonIdx === -1 ? fullId : fullId.slice(0, colonIdx)
}

// Systemic agents every artifact passes through by design — the user never
// interacts with them, so surfacing them as a graph node (or as a border
// parent on every single artifact) is noise, not signal. Flip
// SHOW_HIDDEN_AGENTS back on later for a debug view instead of deleting
// this — that's the whole reason it's a toggle, not a one-off filter.
const HIDDEN_AGENT_NAMES = new Set(["BackgroundSystem"])
const SHOW_HIDDEN_AGENTS = false

function isHiddenAgent(name: string): boolean {
  return !SHOW_HIDDEN_AGENTS && HIDDEN_AGENT_NAMES.has(name)
}

function hiddenAgentIds(bundles: AgentBundleRecord[]): Set<string> {
  return new Set(
    bundles
      .filter(b => isHiddenAgent(b.aboutme.name))
      .map(b => bareAgentId(b.aboutme.id))
  )
}

// Dedupes agents globally by bare agentId (namespace/name) — the same
// agent used across N conversations, or republished as a new build, becomes
// one node, not one per conversation or per digest.
export function buildAgentLayer(
  knowledge: KnowledgeRecord[],
  bundles: AgentBundleRecord[]
): Map<string, AgentLayerNode> {
  const hiddenIds = hiddenAgentIds(bundles)
  const agents = new Map<string, AgentLayerNode>()

  const getOrCreate = (agentId: string, name: string): AgentLayerNode => {
    let node = agents.get(agentId)
    if (!node) {
      node = {
        agentId,
        name,
        conversationIds: new Set(),
        artifactIds: new Set(),
        interactionCount: 0
      }
      agents.set(agentId, node)
    }
    return node
  }

  for (const bundle of bundles) {
    const bareId = bareAgentId(bundle.aboutme.id)
    if (hiddenIds.has(bareId)) continue
    const node = getOrCreate(bareId, bundle.aboutme.name)
    node.conversationIds.add(bundle.conversationId)
  }

  for (const record of knowledge) {
    for (const run of record.agentRuns) {
      const bareId = bareAgentId(run.agentId)
      if (hiddenIds.has(bareId)) continue
      const node = getOrCreate(bareId, bareId)
      node.artifactIds.add(record.id)
    }
  }

  for (const node of agents.values()) {
    node.interactionCount = node.conversationIds.size + node.artifactIds.size
  }

  return agents
}

// Distinct parents per KnowledgeRecord — feeds the medium-node border color
// model (1 parent = single color, N parents = gradient blend, 0 = orphan).
// "conversation" parent is always present today (originConversationId);
// "agent" parents come from agentRuns and may be 0..N, bare-ified so they
// match the same node ids buildAgentLayer produces. Hidden/systemic agents
// are excluded here too — otherwise every artifact they touch would still
// carry them as a border-gradient parent even with no visible node.
export function countParentsByArtifact(
  knowledge: KnowledgeRecord[],
  bundles: AgentBundleRecord[]
): Map<string, string[]> {
  const hiddenIds = hiddenAgentIds(bundles)
  const parents = new Map<string, string[]>()

  for (const record of knowledge) {
    const ids = [`conv-${record.originConversationId}`]
    for (const run of record.agentRuns) {
      const bareId = bareAgentId(run.agentId)
      if (hiddenIds.has(bareId)) continue
      ids.push(`agent-${bareId}`)
    }
    parents.set(record.id, ids)
  }

  return parents
}
