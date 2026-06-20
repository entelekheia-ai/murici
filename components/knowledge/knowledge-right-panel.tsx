/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

"use client"

import { FC, useContext } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChatbotUIContext } from "@/context/context"
import { KnowledgeRecord } from "@/types/knowledge"
import { LLM } from "@/types/llms"
import { KnowledgeChip } from "./knowledge-chip"
import { Button } from "@/components/ui/button"
import { IconX } from "@tabler/icons-react"

export const KnowledgeRightPanel: FC = () => {
  const { knowledge, setKnowledge, chatSettings, availableLocalModels, selectedChat } =
    useContext(ChatbotUIContext)

  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleClose = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("knowledge")
    router.replace(`${pathname}?${params.toString()}`)
  }

  const modelData: LLM | undefined = chatSettings?.model
    ? availableLocalModels.find(m => m.modelId === chatSettings.model)
    : undefined

  const handleUpdate = (id: string, updates: Partial<KnowledgeRecord>) => {
    setKnowledge(prev => prev.map(k => (k.id === id ? { ...k, ...updates } : k)))
  }

  const sorted = [...knowledge].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return (
    <div className="bg-background flex h-full w-[400px] flex-col border-l-2">
      <div className="drag-region flex items-center justify-between border-b-2 p-4">
        <h2 className="select-none text-lg font-bold">Artefatos</h2>
        <Button size="icon" variant="ghost" onClick={handleClose}>
          <IconX size={18} />
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {sorted.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Nenhum artefato ainda nesta conversa.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {sorted.map(record => (
              <KnowledgeChip
                key={record.id}
                record={record}
                modelData={modelData}
                chatName={selectedChat?.name ?? "Conversa"}
                onUpdate={handleUpdate}
              />
            ))}
          </div>
        )}

        <div className="mt-4 border-t pt-4">
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wider">
            Agente
          </h3>
          <p className="text-muted-foreground text-xs">
            Nenhum agente ativo.
          </p>
        </div>
      </div>
    </div>
  )
}
