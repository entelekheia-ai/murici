// SPDX-License-Identifier: Apache-2.0

import type {
  GraphData,
  GraphEdge,
  GraphNode
} from "@entelekheia-ai/cerrado/spec"
import { buildAgentLayer } from "@/lib/knowledge/agent-layer"
import {
  agentRef,
  canRefAgent,
  conversationRef,
  knowledgeRef
} from "@/lib/knowledge/ref"
import type { AgentBundleRecord } from "@/lib/local-db/schema"
import type { Tables } from "@/types/database"
import type { KnowledgeRecord } from "@/types/knowledge"

/** What `buildGraphData` projects: the same three collections the vis-network canvas takes. */
export interface GraphSource {
  knowledge: KnowledgeRecord[]
  agentBundles: AgentBundleRecord[]
  chats: Tables<"chats">[]
}

function toMillis(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? undefined : ms
}

/**
 * Projects Murici's records onto cerrado's `GraphData`.
 *
 * Nodes: each conversation that has an artifact or a loaded agent (a chat
 * with neither is not shown, as in the vis-network canvas), each knowledge
 * record, and each agent `buildAgentLayer` keeps visible. Edges:
 * knowledge -> conversation `generated_in`, agent -> conversation `ran_in`,
 * agent -> knowledge `produced`. A record's own `nodeType` goes to
 * `attrs.nodeType`. Labels are untruncated; a conversation with no matching
 * chat row carries no label, so a renderer falls back to its own.
 *
 * An agent whose bare id the ref-id locator grammar refuses (a Sourcehut `~`
 * namespace) has no identifier and is left out with its edges. Pure: no DOM,
 * no IndexedDB.
 */
export function buildGraphData({
  knowledge,
  agentBundles,
  chats
}: GraphSource): GraphData {
  const chatMap = new Map(chats.map(c => [c.id, c]))
  const involvedChatIds = Array.from(
    new Set([
      ...knowledge.map(k => k.originConversationId),
      ...agentBundles.map(b => b.conversationId)
    ])
  )

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  for (const chatId of involvedChatIds) {
    const chat = chatMap.get(chatId)
    nodes.push({
      id: conversationRef(chatId),
      type: "conversation",
      ...(chat?.name ? { label: chat.name } : {}),
      ...optionalCreatedAt(toMillis(chat?.created_at))
    })
  }

  for (const k of knowledge) {
    nodes.push({
      id: knowledgeRef(k.id),
      type: "knowledge",
      label: k.title,
      attrs: { nodeType: k.nodeType },
      ...optionalCreatedAt(toMillis(k.createdAt))
    })
    edges.push({
      from: knowledgeRef(k.id),
      to: conversationRef(k.originConversationId),
      type: "generated_in"
    })
  }

  const agents = Array.from(buildAgentLayer(knowledge, agentBundles).values())
    .filter(agent => canRefAgent(agent.agentId))
    .sort((a, b) => a.agentId.localeCompare(b.agentId))
  for (const agent of agents) {
    const id = agentRef(agent.agentId)
    nodes.push({ id, type: "agent", label: agent.name })
    for (const convId of agent.conversationIds) {
      edges.push({ from: id, to: conversationRef(convId), type: "ran_in" })
    }
    for (const artifactId of agent.artifactIds) {
      edges.push({ from: id, to: knowledgeRef(artifactId), type: "produced" })
    }
  }

  return { nodes, edges }
}

function optionalCreatedAt(ms: number | undefined): { createdAt?: number } {
  return ms === undefined ? {} : { createdAt: ms }
}
