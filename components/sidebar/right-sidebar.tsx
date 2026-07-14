"use client"
import { CheckCircle, Check, MoreHorizontal, X, FolderOpen, Globe, FileText, Layout, XCircle, Clock, Database, Activity } from "lucide-react"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { FC, useState, useEffect, useRef, useContext } from "react"
import Image from "next/image"
import { Button } from "../ui/button"
import { ChatbotUIContext } from "@/context/context"
import type { UnpackPayload } from "@/types/electron"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "../ui/accordion"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "../ui/alert-dialog"
import { DslHighlightedCode } from "../agents/dsl-highlighted-code"
import { KnowledgeChip } from "../knowledge/knowledge-chip"
import { KnowledgeRecord } from "@/types/knowledge"
import { StateGraph, parseScxml } from "../agents/state-graph"
import { cn } from "@/lib/utils"
import { useRouter, useParams } from "next/navigation"
import { getMcpAndBuiltInTools } from "@/lib/tools/list-available-tools"
import {
  createChatRowOnce,
  prependChatOnce
} from "@/lib/channels/chat-rows"
import { useChannelStore } from "@/lib/store/channel-store"
import { useChatHandler } from "@/lib/hooks/use-chat-handler"
import { useAgentSession } from "@/lib/hooks/use-agent-session"
import { getSetting, setSetting } from "@/lib/local-db/settings"
import { upsertRecentAgent } from "@/lib/local-db/recent-agents"
import { getOnboardingAgentPayload } from "@/lib/agents/system-agents"
import { unpackAgentFileFromPath } from "@/lib/agents/unpack-agent-file"
import { toast } from "sonner"

const APP_VERSION = "0.0.5"

function computePending(scxml: string | null, currentState: string, exclude: Set<string>): string[] {
  if (!scxml || !currentState) return []
  const parsed = parseScxml(scxml)
  if (!parsed) return []
  const seen = new Set<string>()
  const pending: string[] = []
  for (const t of parsed.transitions) {
    if (t.from !== currentState || t.to === currentState) continue
    if (exclude.has(t.to) || seen.has(t.to)) continue
    seen.add(t.to)
    pending.push(t.to)
  }
  return pending
}

export const RightSidebar: FC = () => {
  const router = useRouter()
  const params = useParams()
  const locale = (params?.locale as string) || "local"
  const workspaceid = (params?.workspaceid as string) || "local"
  const {
    flowState,
    knowledge, setKnowledge, chatSettings, availableLocalModels, backgroundModel, selectedChat,
    setShowRightSidebar, chatAgentSessionsRef, activeChatKeyRef,
    profile, selectedWorkspace, selectedAssistant, setSelectedChat, setChats, setChatFiles,
    osPendingAgentPayload, setOsPendingAgentPayload,
    pendingNewAgentPayload, setPendingNewAgentPayload
  } = useContext(ChatbotUIContext)
  // The thread on screen (ADR-0007). A brand-new, unsent chat is a thread with a
  // real id like any other — there is no "__new__" bucket any more.
  const viewedThreadId = useChannelStore(s => s.viewedThreadId)
  const { handleNewChat } = useChatHandler()
  const agentSession = useAgentSession()
  const {
    engine, currentState, graphData, visitedOrder, parseError, behaviorText,
    descriptionText, agentMeta, agentLoading, behaviors,
    setParseError, loadAgentBundle, handleAgentFile, resetSession, hasActiveAgent,
    queueNewChatPayload
  } = agentSession

  const [groupedTools, setGroupedTools] = useState<Record<string, any[]>>({})
  const [toolsLoading, setToolsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true;
    getMcpAndBuiltInTools(flowState || undefined)
      .then(tools => {
        if (!isMounted) return;
        const groups: Record<string, any[]> = {}
        for (const tool of tools) {
          const funcName = tool.function?.name || "unknown"
          let namespace = "Outros"
          let displayName = funcName

          if (funcName.startsWith("mcp__")) {
            const parts = funcName.split("__")
            namespace = parts[1] || "Outros"
            displayName = parts[2] || funcName
          } else if (funcName.startsWith("murici__")) {
            namespace = "murici"
            displayName = funcName.replace("murici__", "")
          } else if (funcName === "trigger_intent") {
            namespace = "murici"
            displayName = "trigger_intent"
          } else {
            namespace = "murici"
          }

          if (!groups[namespace]) groups[namespace] = []
          groups[namespace].push({ name: displayName, description: tool.function?.description || "" })
        }
        setGroupedTools(groups)
        setToolsLoading(false)
      })
      .catch(err => {
        console.error("Error loading tools", err)
        if (isMounted) setToolsLoading(false)
      })

    return () => { isMounted = false }
  }, [flowState])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingAgentPayload, setPendingAgentPayload] = useState<UnpackPayload | null>(null)

  // "Novo chat" always needs a chat with no agent to land the payload on. If we're
  // already sitting on an unsent thread, handleNewChat() would be a no-op for
  // selectedChat and there'd be nothing to navigate to — so swap the agent into
  // that thread in place instead of leaving the payload stuck in the queue.
  const goToNewChatWithPayload = (payload: UnpackPayload) => {
    if (!selectedChat && viewedThreadId) {
      resetSession(viewedThreadId)
      loadAgentBundle(payload, viewedThreadId)
    } else {
      queueNewChatPayload(payload)
      handleNewChat()
    }
  }

  // Opening a .agent from the OS ("abrir com") is ambiguous about which
  // chat it targets. Enforce one-agent-per-chat: if the active chat
  // already has an agent, route straight to a new chat; otherwise ask.
  //
  // Main sends only the PATH — unpacking happens here, through the same route as every
  // other way of opening an agent, so this can't drift from them.
  useEffect(() => {
    if (!osPendingAgentPayload) return
    const { filePath } = osPendingAgentPayload
    setOsPendingAgentPayload(null)

    unpackAgentFileFromPath(filePath)
      .then(payload => {
        upsertRecentAgent({ filePath, aboutme: payload.aboutme }).catch(err =>
          console.error("[recent-agents] upsert failed", err)
        )
        if (hasActiveAgent(activeChatKeyRef.current)) {
          goToNewChatWithPayload(payload)
        } else {
          setPendingAgentPayload(payload)
        }
      })
      .catch(err => {
        // This toast used to be fired from the Electron main process (an
        // "open-agent-file-error" IPC event), because that is where the unpack ran.
        // The unpack lives here now, so the failure surfaces here too.
        console.error("[agent] failed to open .agent from the OS", err)
        toast.error(
          `Falha ao abrir arquivo .agent: ${err?.message ?? String(err)}`
        )
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osPendingAgentPayload, setOsPendingAgentPayload])

  // Bridge for the left-sidebar "Agentes" panel: clicking a row there always
  // opens a brand-new chat, no this-chat-or-new-chat prompt.
  useEffect(() => {
    if (pendingNewAgentPayload) {
      goToNewChatWithPayload(pendingNewAgentPayload)
      setShowRightSidebar(true)
      setPendingNewAgentPayload(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNewAgentPayload, setPendingNewAgentPayload])

  // First-run auto-load: inject the onboarding agent into a fresh, persisted chat
  // once per app version (settings.onboarding_seen_version), regardless of how far
  // the user gets through the tour.
  //
  // The agent is loaded into the thread that is ALREADY on screen (the unsent one),
  // and then that thread's chat row is created UNDER THE SAME ID. No migration step:
  // a thread is born with its final id (ADR-0007), which is what retired the old
  // "build under __new__, then move it onto the real chat" dance — the very step
  // that used to leak an agent into the next chat (ADR-0002).
  const onboardingCheckRef = useRef(false)
  useEffect(() => {
    if (onboardingCheckRef.current) return
    if (!profile || !selectedWorkspace || !chatSettings || !viewedThreadId) return
    onboardingCheckRef.current = true

    const threadId = viewedThreadId

    ;(async () => {
      const seenVersion = await getSetting("onboarding_seen_version")
      if (seenVersion === APP_VERSION) return

      try {
        await setSetting("onboarding_seen_version", APP_VERSION)

        const payload = await getOnboardingAgentPayload()

        await loadAgentBundle(payload, threadId, [
          { domain: "context", key: "onboarding", value: "true" }
        ])
        setShowRightSidebar(true)

        // Shared with ChannelController.send(): both want a row for THIS thread, and a
        // user who types before the .agent above finishes loading gets there first.
        // createChatRowOnce makes whoever is second reuse the first one's row instead
        // of creating a duplicate under the same id.
        const createdChat = await createChatRowOnce(threadId, () => ({
          user_id: profile.user_id,
          workspace_id: selectedWorkspace.id,
          assistant_id: selectedAssistant?.id || null,
          context_length: chatSettings.contextLength,
          include_profile_context: chatSettings.includeProfileContext,
          include_workspace_instructions: chatSettings.includeWorkspaceInstructions,
          model: chatSettings.model,
          name: "Bem-vindo ao Murici",
          prompt: chatSettings.prompt,
          temperature: chatSettings.temperature,
          embeddings_provider: chatSettings.embeddingsProvider
        }))
        setSelectedChat(createdChat)
        setChats(chats => prependChatOnce(chats, createdChat))
      } catch (err) {
        console.error("[onboarding] auto-load failed", err)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, selectedWorkspace, chatSettings, viewedThreadId])


  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await handleAgentFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleLoadAgentClick = () => {
    fileInputRef.current?.click()
  }


  const modelData = chatSettings?.model
    ? availableLocalModels.find(m => m.modelId === chatSettings.model)
    : undefined

  const handleUpdate = (id: string, updates: Partial<KnowledgeRecord>) => {
    setKnowledge(prev => prev.map(k => (k.id === id ? { ...k, ...updates } : k)))
  }

  const sortedKnowledge = [...knowledge].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  const doneStates = visitedOrder.filter(s => s !== currentState)
  const excludeForPending = new Set<string>([...doneStates, currentState].filter(Boolean))
  const pendingStates = computePending(graphData, currentState, excludeForPending)
  const historyRows: Array<{ state: string; status: "done" | "current" | "pending" }> = [
    ...doneStates.map(state => ({ state, status: "done" as const })),
    ...(currentState ? [{ state: currentState, status: "current" as const }] : []),
    ...pendingStates.map(state => ({ state, status: "pending" as const }))
  ]

  return (
    <>
      <AlertDialog
        open={!!pendingAgentPayload}
        onOpenChange={open => { if (!open) setPendingAgentPayload(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Carregar {pendingAgentPayload?.aboutme.name || "agente"}</AlertDialogTitle>
            <AlertDialogDescription>
              Carregar este agente na conversa atual ou criar uma nova conversa para ele?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                const payload = pendingAgentPayload
                setPendingAgentPayload(null)
                if (payload) loadAgentBundle(payload, activeChatKeyRef.current)
              }}
            >
              Nesta conversa
            </Button>
            <AlertDialogAction
              onClick={() => {
                const payload = pendingAgentPayload
                setPendingAgentPayload(null)
                if (payload) goToNewChatWithPayload(payload)
              }}
            >
              Nova conversa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div
        data-dot-id="agent-panel"
        className="bg-inspector-bg flex h-full w-[320px] flex-col border-l border-stroke"
        onDragOver={e => e.preventDefault()}
      >
        <div className="drag-region flex shrink-0 items-center justify-between border-b border-stroke/50 p-4">
          <h2 className="select-none text-[15px] font-semibold text-foreground-primary">
            Detalhes
          </h2>
          <Button size="icon" variant="ghost" className="no-drag size-6 text-foreground-primary hover:text-foreground-primary" onClick={() => setShowRightSidebar(false)}>
            <X size={16} strokeWidth={2} />
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-6 text-foreground-primary">
          <div className="flex flex-col space-y-6">
            <Accordion type="single" collapsible defaultValue="arquivos" className="w-full border-none">
              <AccordionItem value="arquivos" className="border-none">
                <AccordionTrigger className="py-2 text-xs font-semibold uppercase tracking-wider text-foreground-secondary hover:no-underline">
                  Arquivos do Chat
                </AccordionTrigger>
                <AccordionContent>
                  {sortedKnowledge.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Nenhum artefato ainda nesta conversa.
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-col gap-3">
                      {sortedKnowledge.map(record => (
                        <KnowledgeChip
                          key={record.id}
                          record={record}
                          modelData={backgroundModel ?? modelData}
                          chatName={selectedChat?.name ?? "Conversa"}
                          onUpdate={handleUpdate}
                        />
                      ))}
                      <div className="flex w-full justify-end">
                        <Button
                          variant="ghost"
                          className="h-auto justify-end p-0 text-[13px] font-medium text-murici-orange hover:bg-transparent hover:text-[#C05621]/80"
                          onClick={() => {
                            setShowRightSidebar(false)
                            router.push(`/${locale}/${workspaceid}/graph`)
                          }}
                        >
                          Ver todos os arquivos &rarr;
                        </Button>
                      </div>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="bg-sidebar-border h-px w-full" />

            {!agentMeta && !flowState?.currentState ? (
              <div className="flex flex-col items-center justify-center gap-4 bg-[#F7E7D4] p-6">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".agent"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Image
                  src="/empty-state-agent.png"
                  alt="Empty Agent State"
                  width={48}
                  height={48}
                />
                <h2 className="font-instrument-sans text-center text-[20px] font-bold leading-tight text-foreground-primary">
                  Inicie um .agent
                </h2>
                <Button
                  className="font-instrument-sans mt-1 flex h-11 items-center gap-2.5 rounded-[12px] border-none bg-murici-orange px-4 text-[13px] font-bold text-white shadow-none hover:bg-murici-orange/90"
                  onClick={handleLoadAgentClick}
                  disabled={agentLoading}
                >
                  <FolderOpen size={16} strokeWidth={2.5} />
                  {agentLoading ? "Carregando..." : "Iniciar"}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col space-y-6">
                <div className="space-y-4">
                  <h3 className="text-[15px] font-semibold text-foreground-primary">{agentMeta?.name || "Agente"}</h3>
                  {agentMeta?.description && (
                    <div className="space-y-2">
                      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-foreground-secondary">Descrição do Agente</h3>
                      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground-primary">
                        {agentMeta.description}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-foreground-secondary">Histórico de Estados</h3>
                  {historyRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aguardando início do fluxo...</p>
                  ) : (
                    <div>
                      {historyRows.map((row, i) => {
                        const isLast = i === historyRows.length - 1
                        return (
                          <div key={`${row.status}-${row.state}`} className="relative flex gap-3 pb-4 last:pb-0">
                            {!isLast && (
                              <div className="bg-sidebar-border absolute bottom-0 left-[8px] top-5 w-px" />
                            )}
                            <div className="relative z-10 mt-0.5 shrink-0">
                              {row.status === "done" && (
                                <div className="flex h-[18px] w-[18px] items-center justify-center rounded-md border-[1.5px] border-murici-orange">
                                  <Check size={11} strokeWidth={3} className="text-murici-orange" />
                                </div>
                              )}
                              {row.status === "current" && (
                                <div className="h-[18px] w-[18px] rounded-md bg-murici-orange" />
                              )}
                              {row.status === "pending" && (
                                <div className="h-[18px] w-[18px] rounded-md border-[1.5px] border-neutral-400" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p
                                className={cn(
                                  "truncate font-instrument text-[13px]",
                                  row.status === "current"
                                    ? "font-semibold text-foreground-primary"
                                    : "text-foreground-secondary"
                                )}
                              >
                                {row.state}
                              </p>
                              {row.status === "done" && (
                                <p className="mt-0.5 text-[11px] text-murici-orange">Concluído</p>
                              )}
                              {row.status === "current" && (
                                <p className="mt-0.5 text-[11px] text-foreground-secondary">Em andamento</p>
                              )}
                            </div>
                            {row.status === "done" && (
                              <CheckCircle size={16} className="mt-0.5 shrink-0 text-murici-orange" />
                            )}
                            {row.status === "current" && (
                              <MoreHorizontal size={16} className="mt-0.5 shrink-0 text-foreground-secondary" />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {(descriptionText || behaviorText || behaviors.length > 0) && (
                  <div className="space-y-3">
                    <Accordion type="single" collapsible className="w-full border-none">
                      <AccordionItem value="debug" className="border-none">
                        <AccordionTrigger className="py-2 text-[15px] font-semibold text-foreground-primary hover:no-underline">
                          DEBUG
                        </AccordionTrigger>
                        <AccordionContent>
                          <Accordion type="multiple" className="w-full border-none">
                            {descriptionText && (
                              <AccordionItem value="debug-description" className="border-none">
                                <AccordionTrigger className="py-2 text-[12px] font-semibold uppercase tracking-wider text-foreground-secondary hover:no-underline">
                                  {`${agentMeta?.name || "Agente"}.DESCRIPTION`}
                                </AccordionTrigger>
                                <AccordionContent>
                                  <pre className="whitespace-pre-wrap rounded-lg border border-[#b58757] bg-[#fff8f2] p-[10px] font-instrument text-[12px] leading-relaxed text-foreground-primary">
                                    <DslHighlightedCode language="description" value={descriptionText} />
                                  </pre>
                                </AccordionContent>
                              </AccordionItem>
                            )}

                            {behaviorText && (
                              <AccordionItem value="debug-behavior-main" className="border-none">
                                <AccordionTrigger className="py-2 text-[12px] font-semibold uppercase tracking-wider text-foreground-secondary hover:no-underline">
                                  {`${agentMeta?.name || "Agente"}.BEHAVIOR`}
                                </AccordionTrigger>
                                <AccordionContent>
                                  <pre className="whitespace-pre-wrap rounded-lg border border-[#b58757] bg-[#fff8f2] p-[10px] font-instrument text-[12px] leading-relaxed text-foreground-primary">
                                    <DslHighlightedCode language="behavior" value={behaviorText} />
                                  </pre>
                                </AccordionContent>
                              </AccordionItem>
                            )}

                            {behaviors.map((b, i) => (
                              <AccordionItem key={b.path || i} value={`debug-behavior-${i}`} className="border-none">
                                <AccordionTrigger className="py-2 text-[12px] font-semibold uppercase tracking-wider text-foreground-secondary hover:no-underline">
                                  {`${agentMeta?.name || "Agente"}.BEHAVIOR (${b.path || `#${i + 1}`})`}
                                </AccordionTrigger>
                                <AccordionContent>
                                  <pre className="whitespace-pre-wrap rounded-lg border border-[#b58757] bg-[#fff8f2] p-[10px] font-instrument text-[12px] leading-relaxed text-foreground-primary">
                                    <DslHighlightedCode language="behavior" value={b.content} />
                                  </pre>
                                </AccordionContent>
                              </AccordionItem>
                            ))}
                          </Accordion>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                )}

                {graphData && (
                  <div className="space-y-3">
                    <Accordion type="single" collapsible className="w-full border-none">
                      <AccordionItem value="graph" className="border-none">
                        <AccordionTrigger className="py-2 text-[10px] font-semibold uppercase tracking-wider text-foreground-secondary hover:no-underline">
                          Grafo de Execução
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="min-h-[200px] overflow-auto rounded-lg border border-stroke bg-transparent p-2">
                            <StateGraph
                              scxml={graphData}
                              visitedStates={new Set(visitedOrder)}
                            />
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                )}

              </div>
            )}

            <div className="bg-sidebar-border h-px w-full" />

            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-secondary">Ferramentas</h3>
              {toolsLoading ? (
                <p className="text-xs text-muted-foreground">Carregando...</p>
              ) : (
                <div className="space-y-1">
                  <Accordion type="multiple" className="w-full border-none">
                    {Object.entries(groupedTools).map(([namespace, tools]) => (
                      <AccordionItem key={namespace} value={namespace} className="border-none">
                        <AccordionTrigger className="py-2 text-[13px] font-semibold tracking-wider text-foreground-primary hover:no-underline">
                          {namespace}
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="ml-2 flex flex-col gap-3">
                            {tools.map((t: any) => (
                              <div key={t.name} className="text-[13px] leading-snug text-foreground-secondary">
                                <span className="font-semibold text-foreground-primary">{t.name}</span>
                                {t.description ? `: ${t.description}` : ""}
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              )}
            </div>

            {parseError && (
              <div className="mt-4 rounded border border-red-500 bg-red-500/10 p-3 text-sm text-red-500">
                <div className="mb-1 font-bold">Erro de Parse</div>
                <pre className="whitespace-pre-wrap font-mono text-xs">
                  {parseError}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
