"use client"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { FC, useContext, useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { useTranslation } from "react-i18next"
import { ChatbotUIContext } from "@/context/context"
import { KnowledgeChip } from "@/components/knowledge/knowledge-chip"
import { Button } from "@/components/ui/button"
import { getAllKnowledgeRecords } from "@/lib/local-db/knowledge"
import { KnowledgeRecord } from "@/types/knowledge"

export const SidebarFilesContent: FC = () => {
  const { t } = useTranslation()
  const { chats, models, availableLocalModels } = useContext(ChatbotUIContext)
  const router = useRouter()
  const params = useParams()
  const workspaceid = (params?.workspaceid as string) || "local"

  const [allKnowledge, setAllKnowledge] = useState<KnowledgeRecord[]>([])

  useEffect(() => {
    getAllKnowledgeRecords()
      .then(data => setAllKnowledge(data))
      .catch(err => console.error("Error loading all knowledge:", err))
  }, [])

  // Sort knowledge by createdAt desc
  const sortedKnowledge = [...allKnowledge].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  const handleUpdate = (id: string, updates: any) => {
    // Left sidebar might need to trigger global state update if we do it here,
    // but the KnowledgeChip updates the local DB on its own and triggers window event.
    // So we don't strictly need to do much here, or we can rely on context reload.
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-2 pb-16">
        {sortedKnowledge.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              {t("No artifacts yet")}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("Start a conversation to generate files and artifacts.")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sortedKnowledge.map(record => {
              const chat = chats.find(c => c.id === record.originConversationId)
              return (
                <KnowledgeChip
                  key={record.id}
                  record={record}
                  chatName={chat?.name || t("Conversation")}
                  onUpdate={handleUpdate}
                  compact={false}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Floating Button */}
      <div className="absolute bottom-4 left-1/2 z-10 w-[90%] -translate-x-1/2">
        <Button
          className="w-full rounded-xl bg-murici-orange text-sm font-semibold text-white shadow-lg hover:bg-[#C05621]/90"
          onClick={() => router.push(`/${workspaceid}/graph`)}
        >
          Ver todos os arquivos
        </Button>
      </div>
    </div>
  )
}
