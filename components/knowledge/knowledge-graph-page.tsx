/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

"use client"

import { FC, useContext, useEffect, useState } from "react"
import { ChatbotUIContext } from "@/context/context"
import { KnowledgeRecord } from "@/types/knowledge"
import { getAllKnowledgeRecords } from "@/lib/local-db/knowledge"
import { KnowledgeGraphCanvas } from "./knowledge-graph-canvas"
import { KnowledgeListView } from "./knowledge-list-view"
import { Button } from "@/components/ui/button"

type View = "graph" | "list"

export const KnowledgeGraphPage: FC = () => {
  const { chats } = useContext(ChatbotUIContext)
  const [allKnowledge, setAllKnowledge] = useState<KnowledgeRecord[]>([])
  const [view, setView] = useState<View>("graph")
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
        <div className="no-drag flex gap-1 rounded-lg border p-1">
          <Button
            size="sm"
            variant={view === "graph" ? "default" : "ghost"}
            onClick={() => setView("graph")}
          >
            Grafo
          </Button>
          <Button
            size="sm"
            variant={view === "list" ? "default" : "ghost"}
            onClick={() => setView("list")}
          >
            Lista
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="text-muted-foreground flex h-full items-center justify-center">
            Carregando...
          </div>
        ) : allKnowledge.length === 0 ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2">
            <p className="text-lg font-medium">Nenhum artefato ainda</p>
            <p className="text-sm">
              Inicie uma conversa — blocos de código e documentos serão salvos aqui.
            </p>
          </div>
        ) : view === "graph" ? (
          <KnowledgeGraphCanvas knowledge={allKnowledge} chats={chats} />
        ) : (
          <KnowledgeListView knowledge={allKnowledge} chats={chats} />
        )}
      </div>
    </div>
  )
}
