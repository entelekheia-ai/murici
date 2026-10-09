// SPDX-License-Identifier: Apache-2.0

import { createElement, ReactNode, useCallback, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { localeHref } from "@/lib/locale-href"
import {
  buildAgentLayer,
  locateFromRecentAgents
} from "@/lib/knowledge/agent-layer"
import { drawableRecords, parseGraphRef } from "@/lib/knowledge/ref"
import type {
  AgentBundleRecord,
  RecentAgentRecord
} from "@/lib/local-db/schema"
import type { Tables } from "@/types/database"
import type { KnowledgeRecord } from "@/types/knowledge"
import { KnowledgePreviewModal } from "./knowledge-preview-modal"

/** The collections a node identifier is resolved against. */
export interface GraphClickSource {
  knowledge: KnowledgeRecord[]
  chats: Tables<"chats">[]
  agentBundles: AgentBundleRecord[]
  recentAgents?: RecentAgentRecord[]
}

/** What `useGraphClick` returns. */
export interface GraphClick {
  /**
   * Acts on a clicked node by its graph identifier: a conversation pushes the
   * chat route, a knowledge record opens the preview, an agent opens the agent
   * overlay. An identifier that is not a graph reference, or whose record is not
   * in the source, does nothing.
   */
  onNodeClick: (id: string) => void
  /** The preview and agent overlays; render it inside a `relative` container. */
  overlay: ReactNode
}

interface NodePreview {
  record: KnowledgeRecord
  chatName: string
}

interface AgentPreview {
  name: string
  conversationIds: string[]
  artifactIds: string[]
}

const NO_RECENT_AGENTS: RecentAgentRecord[] = []

/**
 * The click behaviour both graph canvases share. It owns the overlays' state
 * and renders them through `overlay`, so a canvas only forwards the clicked
 * node's identifier.
 */
export function useGraphClick({
  knowledge: allKnowledge,
  chats,
  agentBundles: allAgentBundles,
  recentAgents = NO_RECENT_AGENTS
}: GraphClickSource): GraphClick {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useParams()
  const locale = (params?.locale as string) || "en"
  const workspaceid = (params?.workspaceid as string) || "local"
  const [preview, setPreview] = useState<NodePreview | null>(null)
  const [agentPreview, setAgentPreview] = useState<AgentPreview | null>(null)

  const { knowledge, agentBundles } = useMemo(
    () => drawableRecords(allKnowledge, allAgentBundles),
    [allKnowledge, allAgentBundles]
  )
  const agentLayer = useMemo(
    () =>
      buildAgentLayer(
        knowledge,
        agentBundles,
        locateFromRecentAgents(recentAgents)
      ),
    [knowledge, agentBundles, recentAgents]
  )

  const onNodeClick = useCallback(
    (id: string) => {
      const ref = parseGraphRef(id)
      if (!ref) return
      if (ref.kind === "conversation") {
        router.push(localeHref(locale, `/${workspaceid}/chat/${ref.key}`))
      } else if (ref.kind === "knowledge") {
        const record = knowledge.find(k => k.id === ref.key)
        if (record) {
          const chat = chats.find(c => c.id === record.originConversationId)
          setPreview({ record, chatName: chat?.name || t("Conversation") })
        }
      } else if (ref.kind === "agent") {
        const agent = agentLayer.get(ref.key)
        if (agent) {
          setAgentPreview({
            name: agent.name,
            conversationIds: Array.from(agent.conversationIds),
            artifactIds: Array.from(agent.artifactIds)
          })
        }
      }
    },
    [router, locale, workspaceid, knowledge, chats, agentLayer, t]
  )

  const overlay = createElement(
    "div",
    { className: "contents" },
    preview &&
      createElement(KnowledgePreviewModal, {
        record: preview.record,
        chatName: preview.chatName,
        onClose: () => setPreview(null),
        overlay: "absolute"
      }),
    agentPreview &&
      createElement(
        "div",
        {
          className:
            "absolute inset-0 z-50 flex items-center justify-center bg-black/40",
          onClick: () => setAgentPreview(null)
        },
        createElement(
          "div",
          {
            className: "max-w-sm rounded-xl border bg-background p-4 shadow-xl",
            onClick: (e: { stopPropagation: () => void }) => e.stopPropagation()
          },
          createElement(
            "h3",
            { className: "font-semibold" },
            agentPreview.name
          ),
          createElement(
            "p",
            { className: "mt-1 text-sm text-muted-foreground" },
            `${agentPreview.conversationIds.length} conversa(s), ${agentPreview.artifactIds.length} artefato(s)`
          )
        )
      )
  )

  return { onNodeClick, overlay }
}
