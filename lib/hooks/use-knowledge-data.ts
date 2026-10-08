// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react"
import { KnowledgeRecord } from "@/types/knowledge"
import { AgentBundleRecord, RecentAgentRecord } from "@/lib/local-db/schema"
import { getAllKnowledgeRecords } from "@/lib/local-db/knowledge"
import { getAllAgentBundles } from "@/lib/local-db/agent-bundles"
import { getAllRecentAgents } from "@/lib/local-db/recent-agents"

export const useKnowledgeData = () => {
  const [knowledge, setKnowledge] = useState<KnowledgeRecord[]>([])
  const [agentBundles, setAgentBundles] = useState<AgentBundleRecord[]>([])
  const [recentAgents, setRecentAgents] = useState<RecentAgentRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getAllKnowledgeRecords(),
      getAllAgentBundles(),
      getAllRecentAgents()
    ])
      .then(([knowledgeData, bundlesData, recentData]) => {
        setKnowledge(knowledgeData)
        setAgentBundles(bundlesData)
        setRecentAgents(recentData)
      })
      .finally(() => setLoading(false))
  }, [])

  return { knowledge, agentBundles, recentAgents, loading }
}
