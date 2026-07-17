import { Paperclip, Send } from "lucide-react"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { FC, useState } from "react"
import { useTranslation } from "react-i18next"
import { KnowledgeRecord } from "@/types/knowledge"
import { Tables } from "@/types/database"
import { AgentBundleRecord } from "@/lib/local-db/schema"
import { KnowledgeGraphCanvas } from "./knowledge-graph-canvas"
import { KnowledgeListView } from "./knowledge-list-view"
import { Button } from "@/components/ui/button"
import { Header } from "@/components/chat/header"
import { ScreenLoader } from "@/components/ui/screen-loader"
import { useHeaderControls } from "@/lib/hooks/use-header-controls"

interface KnowledgeHomeViewProps {
  knowledge: KnowledgeRecord[]
  chats: Tables<"chats">[]
  agentBundles: AgentBundleRecord[]
  loading?: boolean
  onStartChat?: () => void
}

type View = "graph" | "list"

export const KnowledgeHomeView: FC<KnowledgeHomeViewProps> = ({
  knowledge,
  chats,
  agentBundles,
  loading = false,
  onStartChat
}) => {
  const { t } = useTranslation()
  const [view, setView] = useState<View>("graph")
  const headerProps = useHeaderControls()

  return (
    <div className="flex size-full flex-col overflow-hidden">
      <Header title={t("Knowledge")} {...headerProps} />

      {/* Main Content Area */}
      <div className="relative flex-1 overflow-hidden">
        {loading ? (
          <ScreenLoader />
        ) : knowledge.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <p className="text-lg font-medium">{t("No artifacts yet")}</p>
            <p className="text-sm">
              {t(
                "Start a conversation — code blocks and documents will be saved here."
              )}
            </p>
          </div>
        ) : (
          <>
            {/* Floating View Toggle */}
            <div className="absolute right-4 top-4 z-[60] flex gap-1 rounded-lg border bg-background/80 p-1 backdrop-blur-sm">
              <Button
                size="sm"
                variant={view === "graph" ? "default" : "ghost"}
                onClick={() => setView("graph")}
              >
                {t("Graph")}
              </Button>
              <Button
                size="sm"
                variant={view === "list" ? "default" : "ghost"}
                onClick={() => setView("list")}
              >
                {t("List")}
              </Button>
            </div>

            {view === "graph" ? (
              <KnowledgeGraphCanvas
                knowledge={knowledge}
                chats={chats}
                agentBundles={agentBundles}
              />
            ) : (
              <div className="size-full pt-24">
                <KnowledgeListView knowledge={knowledge} chats={chats} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
