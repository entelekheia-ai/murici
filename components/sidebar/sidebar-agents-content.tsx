"use client"
import { ArrowUpDown } from "lucide-react"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { ChatbotUIContext } from "@/context/context"
import { getOnboardingAgentPayload } from "@/lib/agents/system-agents"
import { unpackAgentFileFromPath } from "@/lib/agents/unpack-agent-file"
import {
  getAllRecentAgents,
  removeRecentAgent,
  upsertRecentAgent
} from "@/lib/local-db/recent-agents"
import { RecentAgentRecord } from "@/lib/local-db/schema"
import type { UnpackPayload } from "@/types/electron"

import { FC, useContext, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { AgentRowItem } from "./items/agents/agent-row-item"

type SortMode = "recent" | "alphabetical"

export const SidebarAgentsContent: FC = () => {
  const { t } = useTranslation()
  const { setPendingNewAgentPayload, setShowRightSidebar } = useContext(
    ChatbotUIContext
  )

  const [recentAgents, setRecentAgents] = useState<RecentAgentRecord[]>([])
  const [onboardingPayload, setOnboardingPayload] =
    useState<UnpackPayload | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>("recent")

  useEffect(() => {
    getAllRecentAgents()
      .then(setRecentAgents)
      .catch(err => console.error("[agents-panel] failed to load recents", err))
    getOnboardingAgentPayload()
      .then(setOnboardingPayload)
      .catch(err =>
        console.error("[agents-panel] failed to load onboarding agent", err)
      )
  }, [])

  const notFoundToast = () =>
    toast.error(
      t(
        "Agent file could not be found. It may have been moved or deleted."
      )
    )

  const sortedRecentAgents = [...recentAgents].sort((a, b) =>
    sortMode === "alphabetical"
      ? a.aboutme.name.localeCompare(b.aboutme.name)
      : new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()
  )

  const handleOpenOnboarding = async () => {
    try {
      const payload = onboardingPayload ?? (await getOnboardingAgentPayload())
      setShowRightSidebar(true)
      setPendingNewAgentPayload(payload)
    } catch (err) {
      console.error("[agents-panel] failed to open onboarding agent", err)
      notFoundToast()
    }
  }

  const handleOpenRecent = async (record: RecentAgentRecord) => {
    if (!record.filePath || !window.electronAPI?.readAgentFile) {
      notFoundToast()
      return
    }
    try {
      const payload = await unpackAgentFileFromPath(record.filePath)
      const updated = await upsertRecentAgent({
        filePath: record.filePath,
        aboutme: payload.aboutme
      })
      setRecentAgents(prev => [
        ...prev.filter(r => r.id !== updated.id),
        updated
      ])
      setShowRightSidebar(true)
      setPendingNewAgentPayload(payload)
    } catch (err) {
      console.error("[agents-panel] failed to resolve agent file", err)
      notFoundToast()
    }
  }

  const handleRemove = async (id: string) => {
    try {
      await removeRecentAgent(id)
      setRecentAgents(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      console.error("[agents-panel] failed to remove recent agent", err)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <Accordion
          type="multiple"
          defaultValue={["system", "recent"]}
          className="w-full border-none"
        >
          <AccordionItem value="system" className="border-none">
            <AccordionTrigger className="py-2 text-xs font-semibold uppercase tracking-wider text-foreground-secondary hover:no-underline">
              {t("System")}
            </AccordionTrigger>
            <AccordionContent>
              <AgentRowItem
                name={onboardingPayload?.aboutme.name ?? "Onboarding"}
                description={onboardingPayload?.aboutme.description}
                onClick={handleOpenOnboarding}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="recent" className="border-none">
            <AccordionTrigger className="py-2 text-xs font-semibold uppercase tracking-wider text-foreground-secondary hover:no-underline">
              {t("Recent")}
            </AccordionTrigger>
            <AccordionContent>
              {sortedRecentAgents.length > 0 && (
                <div className="mb-2 flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs text-foreground-secondary"
                      >
                        <ArrowUpDown size={14} />
                        {sortMode === "recent" ? t("Recent") : t("Alphabetical")}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setSortMode("recent")}>
                        {t("Recent")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setSortMode("alphabetical")}
                      >
                        {t("Alphabetical")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              {sortedRecentAgents.length === 0 ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  {t("No recent agents.")}
                </p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {sortedRecentAgents.map(record => (
                    <AgentRowItem
                      key={record.id}
                      name={record.aboutme.name}
                      description={record.aboutme.description}
                      onClick={() => handleOpenRecent(record)}
                      onRemove={() => handleRemove(record.id)}
                    />
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  )
}
