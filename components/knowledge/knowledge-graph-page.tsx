/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

"use client"

import { FC, useContext, useEffect, useState } from "react"
import { ChatbotUIContext } from "@/context/context"
import { KnowledgeRecord } from "@/types/knowledge"
import { getAllKnowledgeRecords } from "@/lib/local-db/knowledge"
import { KnowledgeHomeView } from "./knowledge-home-view"

export const KnowledgeGraphPage: FC = () => {
  const { chats } = useContext(ChatbotUIContext)
  const [allKnowledge, setAllKnowledge] = useState<KnowledgeRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAllKnowledgeRecords()
      .then(setAllKnowledge)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="drag-region flex items-center justify-between border-b px-6 py-3">
        <h1 className="select-none text-xl font-bold">Grafo de Conhecimento</h1>
      </div>

      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="text-muted-foreground flex h-full items-center justify-center">
            Carregando...
          </div>
        ) : (
          <KnowledgeHomeView knowledge={allKnowledge} chats={chats} />
        )}
      </div>
    </div>
  )
}
