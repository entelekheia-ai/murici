"use client"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { FC, useContext } from "react"
import { ChatbotUIContext } from "@/context/context"
import { useKnowledgeData } from "@/lib/hooks/use-knowledge-data"
import { KnowledgeHomeView } from "./knowledge-home-view"

export const KnowledgeGraphPage: FC = () => {
  const { chats } = useContext(ChatbotUIContext)
  const { knowledge, agentBundles, loading } = useKnowledgeData()

  return (
    <KnowledgeHomeView
      knowledge={knowledge}
      chats={chats}
      agentBundles={agentBundles}
      loading={loading}
    />
  )
}
