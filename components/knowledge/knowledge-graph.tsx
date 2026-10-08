// SPDX-License-Identifier: Apache-2.0

"use client"

import { FC, useState } from "react"
import type {
  AgentBundleRecord,
  RecentAgentRecord
} from "@/lib/local-db/schema"
import type { Tables } from "@/types/database"
import type { KnowledgeRecord } from "@/types/knowledge"
import { CerradoGraphCanvas } from "./cerrado-graph-canvas"
import { KnowledgeGraphCanvas } from "./knowledge-graph-canvas"

interface KnowledgeGraphProps {
  knowledge: KnowledgeRecord[]
  chats: Tables<"chats">[]
  agentBundles: AgentBundleRecord[]
  recentAgents?: RecentAgentRecord[]
}

/**
 * The knowledge graph: drawn by cerrado, or by the vis-network canvas when
 * cerrado cannot start (no WebGPU, a failure while mounting). The fallback
 * holds for the rest of this mount.
 */
export const KnowledgeGraph: FC<KnowledgeGraphProps> = props => {
  const [unavailable, setUnavailable] = useState(false)
  if (unavailable) return <KnowledgeGraphCanvas {...props} />
  return (
    <CerradoGraphCanvas {...props} onUnavailable={() => setUnavailable(true)} />
  )
}
