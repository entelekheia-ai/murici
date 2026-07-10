/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { useEffect, useState } from "react"
import { KnowledgeRecord } from "@/types/knowledge"
import { AgentBundleRecord } from "@/lib/local-db/schema"
import { getAllKnowledgeRecords } from "@/lib/local-db/knowledge"
import { getAllAgentBundles } from "@/lib/local-db/agent-bundles"

export const useKnowledgeData = () => {
  const [knowledge, setKnowledge] = useState<KnowledgeRecord[]>([])
  const [agentBundles, setAgentBundles] = useState<AgentBundleRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getAllKnowledgeRecords(), getAllAgentBundles()])
      .then(([knowledgeData, bundlesData]) => {
        setKnowledge(knowledgeData)
        setAgentBundles(bundlesData)
      })
      .finally(() => setLoading(false))
  }, [])

  return { knowledge, agentBundles, loading }
}
