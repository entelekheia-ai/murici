/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

"use client"

import { FC, useState, useEffect, useRef, useContext } from "react"
import Image from "next/image"
import { Button } from "../ui/button"
import { ChatAgentSession, ChatbotUIContext } from "@/context/context"
import type { UnpackPayload, AgentAboutme } from "@/types/electron"
import { IconCircleCheck, IconCheck, IconDots, IconX, IconFolderOpen, IconGlobe, IconFileText, IconLayout, IconCircleX, IconClock, IconDatabase, IconActivity } from "@tabler/icons-react"
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
import { KernelProxy } from "@/lib/kernel-proxy"
import { handleKernelEffects } from "@/lib/kernel-effects"
import { KnowledgeChip } from "../knowledge/knowledge-chip"
import { KnowledgeRecord } from "@/types/knowledge"
import { StateGraph, parseScxml } from "../agents/state-graph"
import { cn } from "@/lib/utils"
import { useRouter, useParams } from "next/navigation"
import { getMcpAndBuiltInTools, handleCreateChat } from "../chat/chat-helpers"
import { useChatHandler } from "../chat/chat-hooks/use-chat-handler"
import { getSetting, setSetting } from "@/lib/local-db/settings"

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
    setFlowState, setFlowEngine, flowState, setAgentKnowledgeFiles, setAgentPersona,
    knowledge, setKnowledge, chatSettings, availableLocalModels, backgroundModel, selectedChat,
    setShowRightSidebar, chatAgentSessionsRef, destroyChatAgentSession, migrateChatAgentSession,
    profile, selectedWorkspace, selectedAssistant, setSelectedChat, setChats, setChatFiles,
    osPendingAgentPayload, setOsPendingAgentPayload
  } = useContext(ChatbotUIContext)
  const { handleNewChat } = useChatHandler()

  const [engine, setEngine] = useState<any>(null)
  const [currentState, setCurrentState] = useState<string>("")
  const [graphData, setGraphData] = useState<string | null>(null)
  const [visitedOrder, setVisitedOrder] = useState<string[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [behaviorText, setBehaviorText] = useState("")
  const [descriptionText, setDescriptionText] = useState("")
  const [agentMeta, setAgentMeta] = useState<AgentAboutme | null>(null)
  const [agentLoading, setAgentLoading] = useState(false)
  const [behaviors, setBehaviors] = useState<Array<{ path: string; content: string }>>([])

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
  const engineRef = useRef<any>(null)
  const visitedRef = useRef<string[]>([])
  const activeChatKeyRef = useRef<string>("__new__")

  const loadAgentBundleRef = useRef<
    (
      payload: UnpackPayload,
      targetChatKey?: string,
      initialMemory?: Array<{ domain: string; key: string; value: string }>
    ) => Promise<void>
  >(async () => { })
  const handleAgentFileRef = useRef<(file: File) => Promise<void>>(async () => { })
  const handleOpenAgentFileEventRef = useRef<(payload: UnpackPayload) => void>(() => { })
  const goToNewChatWithPayloadRef = useRef<(payload: UnpackPayload) => void>(() => { })
  const pendingNewChatPayloadRef = useRef<UnpackPayload | null>(null)

  const [pendingAgentPayload, setPendingAgentPayload] = useState<UnpackPayload | null>(null)

  const getOrCreateSession = (chatKey: string): ChatAgentSession => {
    let session = chatAgentSessionsRef.current.get(chatKey)
    if (!session) {
      session = {
        proxy: new KernelProxy(),
        agentMeta: null,
        behaviorText: "",
        descriptionText: "",
        currentState: "",
        graphData: null,
        visitedOrder: [],
        parseError: null,
        knowledge: [],
        guides: [],
        behaviors: [],
        flowState: null
      }
      chatAgentSessionsRef.current.set(chatKey, session)
    }
    return session
  }

  const updateSession = (chatKey: string, patch: Partial<ChatAgentSession>) => {
    const existing = chatAgentSessionsRef.current.get(chatKey)
    if (!existing) return
    chatAgentSessionsRef.current.set(chatKey, { ...existing, ...patch })
  }

  const applySessionToView = (session: ChatAgentSession) => {
    engineRef.current = session.proxy
    visitedRef.current = [...session.visitedOrder]
    setEngine(session.proxy)
    setFlowEngine(session.proxy)
    setAgentMeta(session.agentMeta)
    setAgentPersona(session.agentMeta?.persona || null)
    setBehaviorText(session.behaviorText)
    setDescriptionText(session.descriptionText)
    setCurrentState(session.currentState)
    setGraphData(session.graphData)
    setVisitedOrder(session.visitedOrder)
    setParseError(session.parseError)
    setAgentKnowledgeFiles(session.knowledge)
    setFlowState(session.flowState)
    setBehaviors(session.behaviors)
  }

  const resolveTeach = (
    name: string | undefined,
    know: Array<{ path: string; content: string }>
  ): string | undefined => {
    if (!name) return undefined
    const entry = know.find(
      k => k.path === name || k.path === `knowledge/${name}` || k.path.endsWith(`/${name}`)
    )
    return entry ? entry.content : name
  }

  const loadBehavior = async (
    chatKey: string,
    eng: any,
    text: string,
    know: Array<{ path: string; content: string }> = [],
    guides: Array<{ path: string; content: string }> = [],
    behaviors: Array<{ path: string; content: string }> = [],
    initialMemory: Array<{ domain: string; key: string; value: string }> = []
  ) => {
    const isActive = () => chatKey === activeChatKeyRef.current
    if (isActive()) setParseError(null)

    try {
      const effects = await eng.load_behavior(text, know, guides, behaviors, initialMemory)

      const parseErrorEffect = effects.find((e: any) => e.type === "parse_error")
      if (parseErrorEffect) {
        updateSession(chatKey, { parseError: parseErrorEffect.message })
        if (isActive()) setParseError(parseErrorEffect.message)
        return
      }

      if (isActive()) handleKernelEffects(effects, { setShowRightSidebar })

      const state = eng.get_current_state()
      const graph = eng.get_graph()
      const goal = effects.find((e: any) => e.type === "goal")?.text
      const guide = effects.find((e: any) => e.type === "guide")?.text
      const teach = resolveTeach(effects.find((e: any) => e.type === "teach")?.text, know)
      const newFlowState = {
        currentState: state,
        goal,
        guide,
        teach,
        validIntents: Array.from(eng.get_valid_intents() || []) as string[],
        graph
      }

      updateSession(chatKey, {
        knowledge: know,
        guides,
        behaviors,
        currentState: state,
        visitedOrder: [state],
        graphData: graph,
        parseError: null,
        flowState: newFlowState
      })

      if (isActive()) {
        visitedRef.current = [state]
        setCurrentState(state)
        setVisitedOrder([state])
        setGraphData(graph)
        setAgentKnowledgeFiles(know)
        setFlowState(newFlowState)
        setBehaviors(behaviors)
      }
    } catch (e: any) {
      const message = e.message || "Failed to load behavior"
      updateSession(chatKey, { parseError: message })
      if (isActive()) setParseError(message)
    }
  }

  useEffect(() => {
    if (!flowState?.currentState || !engineRef.current) return
    const newState = flowState.currentState
    if (newState === currentState) return
    if (!visitedRef.current.includes(newState)) visitedRef.current.push(newState)
    setCurrentState(newState)
    setVisitedOrder([...visitedRef.current])
    const freshGraph = engineRef.current.get_graph()
    if (freshGraph) setGraphData(freshGraph)

    const chatKey = activeChatKeyRef.current
    updateSession(chatKey, {
      currentState: newState,
      visitedOrder: [...visitedRef.current],
      graphData: freshGraph || chatAgentSessionsRef.current.get(chatKey)?.graphData || null,
      flowState
    })
  }, [flowState?.currentState])

  // Swap the active agent session whenever the visible chat changes, so each
  // chat keeps its own KernelProxy/sessionId instead of sharing a global one.
  useEffect(() => {
    const chatKey = selectedChat?.id ?? "__new__"
    activeChatKeyRef.current = chatKey
    const session = getOrCreateSession(chatKey)
    applySessionToView(session)

    if (pendingNewChatPayloadRef.current) {
      const payload = pendingNewChatPayloadRef.current
      pendingNewChatPayloadRef.current = null
      loadAgentBundleRef.current(payload, chatKey)
    }
  }, [selectedChat?.id])

  // First-run auto-load: inject the onboarding-agent into a fresh, persisted
  // chat once per app version (settings.onboarding_seen_version), regardless
  // of how far the user gets through the tour. Builds the session under the
  // "__new__" bucket first, then creates the real chat and migrates the
  // session onto it — same idiom used elsewhere for "chat didn't exist yet
  // when we started building agent state" (see migrateChatAgentSession).
  const onboardingCheckRef = useRef(false)
  useEffect(() => {
    if (onboardingCheckRef.current) return
    if (!profile || !selectedWorkspace || !chatSettings) return
    onboardingCheckRef.current = true

    ;(async () => {
      const seenVersion = await getSetting("onboarding_seen_version")
      if (seenVersion === APP_VERSION) return

      try {
        await setSetting("onboarding_seen_version", APP_VERSION)

        const fileRes = await fetch("/agents/onboarding.agent")
        if (!fileRes.ok) return
        const agentBlob = await fileRes.blob()
        const unpackRes = await fetch("/api/agent/unpack", {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-Agent-Filename": "onboarding.agent"
          },
          body: agentBlob
        })
        if (!unpackRes.ok) return
        const payload: UnpackPayload = await unpackRes.json()

        await loadAgentBundleRef.current(payload, "__new__", [
          { domain: "context", key: "onboarding", value: "true" }
        ])
        setShowRightSidebar(true)

        const setSelectedChatAndMigrateSession: typeof setSelectedChat = value => {
          const nextChat =
            typeof value === "function" ? (value as any)(selectedChat) : value
          if (nextChat) migrateChatAgentSession("__new__", nextChat.id)
          setSelectedChat(value)
        }

        await handleCreateChat(
          chatSettings,
          profile,
          selectedWorkspace,
          "Bem-vindo ao Murici",
          selectedAssistant!,
          [],
          setSelectedChatAndMigrateSession,
          setChats,
          setChatFiles
        )
      } catch (err) {
        console.error("[onboarding] auto-load failed", err)
      }
    })()
  }, [profile, selectedWorkspace, chatSettings])

  loadAgentBundleRef.current = async (
    payload: UnpackPayload,
    targetChatKey?: string,
    initialMemory: Array<{ domain: string; key: string; value: string }> = []
  ) => {
    const chatKey = targetChatKey ?? activeChatKeyRef.current
    const session = getOrCreateSession(chatKey)
    updateSession(chatKey, {
      agentMeta: payload.aboutme,
      behaviorText: payload.behaviorText,
      descriptionText: payload.descriptionText || ""
    })
    if (chatKey === activeChatKeyRef.current) {
      setAgentMeta(payload.aboutme)
      setAgentPersona(payload.aboutme.persona || null)
      setBehaviorText(payload.behaviorText)
      setDescriptionText(payload.descriptionText || "")
    }
    await loadBehavior(chatKey, session.proxy, payload.behaviorText, payload.knowledge, payload.guides, payload.behaviors, initialMemory)
  }

  // "Novo chat" always needs a chat with no agent to land the payload on.
  // If we're already sitting on the "__new__" (unsaved) bucket, calling
  // handleNewChat() is a no-op for selectedChat, so there's nothing to
  // navigate to - reset that bucket in place instead of leaving the
  // payload stuck in pendingNewChatPayloadRef.
  const goToNewChatWithPayload = (payload: UnpackPayload) => {
    if (activeChatKeyRef.current === "__new__") {
      destroyChatAgentSession("__new__")
      const fresh = getOrCreateSession("__new__")
      applySessionToView(fresh)
      loadAgentBundleRef.current(payload, "__new__")
    } else {
      pendingNewChatPayloadRef.current = payload
      handleNewChat()
    }
  }
  goToNewChatWithPayloadRef.current = goToNewChatWithPayload

  // Opening a .agent from the OS ("abrir com") is ambiguous about which
  // chat it targets. Enforce one-agent-per-chat: if the active chat
  // already has an agent, route straight to a new chat; otherwise ask.
  handleOpenAgentFileEventRef.current = (payload: UnpackPayload) => {
    const chatKey = activeChatKeyRef.current
    const session = chatAgentSessionsRef.current.get(chatKey)
    if (session?.agentMeta) {
      goToNewChatWithPayload(payload)
    } else {
      setPendingAgentPayload(payload)
    }
  }

  useEffect(() => {
    if (osPendingAgentPayload) {
      handleOpenAgentFileEventRef.current(osPendingAgentPayload)
      setOsPendingAgentPayload(null)
    }
  }, [osPendingAgentPayload, setOsPendingAgentPayload])

  useEffect(() => {

    const onAgentDrop = (e: Event) => {
      const file = (e as CustomEvent<{ file: File }>).detail.file
      handleAgentFileRef.current(file)
    }
    window.addEventListener("agent:drop", onAgentDrop)

    return () => {
      window.removeEventListener("agent:drop", onAgentDrop)
    }
  }, [])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await handleAgentFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleLoadAgentClick = () => {
    fileInputRef.current?.click()
  }

  const handleAgentFile = async (file: File) => {
    if (!file.name.endsWith(".agent")) return
    setAgentLoading(true)
    try {
      // Sent as a raw body instead of multipart/form-data: Node's undici-based
      // multipart parser throws "Cannot read properties of undefined (reading
      // 'toLowerCase')" deep inside its own header parser for some requests
      // when running under Electron's bundled Node (reproduced with a real
      // .agent file via both the file picker and drag-and-drop). A raw body
      // has no multipart boundary/header parsing to trip over.
      const res = await fetch("/api/agent/unpack", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Agent-Filename": encodeURIComponent(file.name)
        },
        body: file
      })
      if (!res.ok) {
        const error = await res.json()
        setParseError(error.error || "Failed to unpack agent")
        return
      }
      const payload: UnpackPayload = await res.json()
      await loadAgentBundleRef.current(payload)
    } catch (err: any) {
      setParseError(err.message || "Failed to load agent")
    } finally {
      setAgentLoading(false)
    }
  }
  handleAgentFileRef.current = handleAgentFile

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files?.[0]
    if (file) handleAgentFile(file)
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

  const validIntents = engine
    ? (Array.from(engine.get_valid_intents() || []) as string[])
    : []

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
                if (payload) loadAgentBundleRef.current(payload, activeChatKeyRef.current)
              }}
            >
              Nesta conversa
            </Button>
            <AlertDialogAction
              onClick={() => {
                const payload = pendingAgentPayload
                setPendingAgentPayload(null)
                if (payload) goToNewChatWithPayloadRef.current(payload)
              }}
            >
              Nova conversa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div
        data-dot-id="agent-panel"
        className="bg-inspector-bg flex h-full w-[320px] flex-col border-l border-sidebar-border"
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="drag-region flex items-center justify-between border-b p-4 border-sidebar-border/50 shrink-0">
          <h2 className="select-none text-[15px] font-semibold text-murici-text-primary">
            Detalhes
          </h2>
          <Button size="icon" variant="ghost" className="no-drag h-6 w-6 text-murici-text-primary hover:text-murici-text-primary" onClick={() => setShowRightSidebar(false)}>
            <IconX size={16} stroke={2} />
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-6 text-murici-text-primary">
          <div className="flex flex-col space-y-6">
            <Accordion type="single" collapsible defaultValue="arquivos" className="w-full border-none">
              <AccordionItem value="arquivos" className="border-none">
                <AccordionTrigger className="text-xs uppercase font-semibold text-murici-text-secondary py-2 hover:no-underline tracking-wider">
                  Arquivos do Chat
                </AccordionTrigger>
                <AccordionContent>
                  {sortedKnowledge.length === 0 ? (
                    <p className="text-muted-foreground text-xs mt-2">
                      Nenhum artefato ainda nesta conversa.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3 mt-2">
                      {sortedKnowledge.map(record => (
                        <KnowledgeChip
                          key={record.id}
                          record={record}
                          modelData={backgroundModel ?? modelData}
                          chatName={selectedChat?.name ?? "Conversa"}
                          onUpdate={handleUpdate}
                        />
                      ))}
                      <div className="flex justify-end w-full">
                        <Button
                          variant="ghost"
                          className="text-[13px] font-medium text-[#C05621] hover:text-[#C05621]/80 hover:bg-transparent h-auto p-0 justify-end"
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

            <div className="h-px w-full bg-sidebar-border" />

            {!agentMeta && !flowState?.currentState ? (
              <div className="flex flex-col items-center justify-center p-6 gap-4 bg-[#F7E7D4]">
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
                <h2 className="text-[20px] font-bold font-instrument-sans text-murici-text-primary text-center leading-tight">
                  Inicie um .agent
                </h2>
                <Button
                  className="bg-murici-orange hover:bg-murici-orange/90 text-white rounded-[12px] h-11 px-4 font-instrument-sans font-bold text-[13px] gap-2.5 flex items-center shadow-none border-none mt-1"
                  onClick={handleLoadAgentClick}
                  disabled={agentLoading}
                >
                  <IconFolderOpen size={16} stroke={2.5} />
                  {agentLoading ? "Carregando..." : "Iniciar"}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col space-y-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-murici-text-primary text-[15px]">{agentMeta?.name || "Agente"}</h3>
                  {agentMeta?.description && (
                    <div className="space-y-2">
                      <h3 className="font-semibold uppercase text-[10px] text-murici-text-secondary tracking-wider">Descrição do Agente</h3>
                      <p className="text-[13px] text-murici-text-primary whitespace-pre-wrap leading-relaxed">
                        {agentMeta.description}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold uppercase text-[10px] text-murici-text-secondary tracking-wider">Histórico de Estados</h3>
                  {historyRows.length === 0 ? (
                    <p className="text-muted-foreground text-xs">Aguardando início do fluxo...</p>
                  ) : (
                    <div>
                      {historyRows.map((row, i) => {
                        const isLast = i === historyRows.length - 1
                        return (
                          <div key={`${row.status}-${row.state}`} className="relative flex gap-3 pb-4 last:pb-0">
                            {!isLast && (
                              <div className="absolute left-[8px] top-5 bottom-0 w-px bg-sidebar-border" />
                            )}
                            <div className="relative z-10 mt-0.5 shrink-0">
                              {row.status === "done" && (
                                <div className="flex h-[18px] w-[18px] items-center justify-center rounded-md border-[1.5px] border-murici-orange">
                                  <IconCheck size={11} stroke={3} className="text-murici-orange" />
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
                                  "font-instrument truncate text-[13px]",
                                  row.status === "current"
                                    ? "font-semibold text-murici-text-primary"
                                    : "text-murici-text-secondary"
                                )}
                              >
                                {row.state}
                              </p>
                              {row.status === "done" && (
                                <p className="mt-0.5 text-[11px] text-murici-orange">Concluído</p>
                              )}
                              {row.status === "current" && (
                                <p className="mt-0.5 text-[11px] text-murici-text-secondary">Em andamento</p>
                              )}
                            </div>
                            {row.status === "done" && (
                              <IconCircleCheck size={16} className="mt-0.5 shrink-0 text-murici-orange" />
                            )}
                            {row.status === "current" && (
                              <IconDots size={16} className="mt-0.5 shrink-0 text-murici-text-secondary" />
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
                        <AccordionTrigger className="text-[15px] font-semibold text-murici-text-primary py-2 hover:no-underline">
                          DEBUG
                        </AccordionTrigger>
                        <AccordionContent>
                          <Accordion type="multiple" className="w-full border-none">
                            {descriptionText && (
                              <AccordionItem value="debug-description" className="border-none">
                                <AccordionTrigger className="text-[12px] uppercase font-semibold text-murici-text-secondary py-2 hover:no-underline tracking-wider">
                                  {`${agentMeta?.name || "Agente"}.DESCRIPTION`}
                                </AccordionTrigger>
                                <AccordionContent>
                                  <pre className="whitespace-pre-wrap rounded-lg border border-[#b58757] bg-[#fff8f2] p-[10px] font-instrument text-[12px] leading-relaxed text-murici-text-primary">
                                    <DslHighlightedCode language="description" value={descriptionText} />
                                  </pre>
                                </AccordionContent>
                              </AccordionItem>
                            )}

                            {behaviorText && (
                              <AccordionItem value="debug-behavior-main" className="border-none">
                                <AccordionTrigger className="text-[12px] uppercase font-semibold text-murici-text-secondary py-2 hover:no-underline tracking-wider">
                                  {`${agentMeta?.name || "Agente"}.BEHAVIOR`}
                                </AccordionTrigger>
                                <AccordionContent>
                                  <pre className="whitespace-pre-wrap rounded-lg border border-[#b58757] bg-[#fff8f2] p-[10px] font-instrument text-[12px] leading-relaxed text-murici-text-primary">
                                    <DslHighlightedCode language="behavior" value={behaviorText} />
                                  </pre>
                                </AccordionContent>
                              </AccordionItem>
                            )}

                            {behaviors.map((b, i) => (
                              <AccordionItem key={b.path || i} value={`debug-behavior-${i}`} className="border-none">
                                <AccordionTrigger className="text-[12px] uppercase font-semibold text-murici-text-secondary py-2 hover:no-underline tracking-wider">
                                  {`${agentMeta?.name || "Agente"}.BEHAVIOR (${b.path || `#${i + 1}`})`}
                                </AccordionTrigger>
                                <AccordionContent>
                                  <pre className="whitespace-pre-wrap rounded-lg border border-[#b58757] bg-[#fff8f2] p-[10px] font-instrument text-[12px] leading-relaxed text-murici-text-primary">
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
                        <AccordionTrigger className="text-[10px] uppercase font-semibold text-murici-text-secondary py-2 hover:no-underline tracking-wider">
                          Grafo de Execução
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="bg-transparent overflow-auto rounded-lg border border-sidebar-border p-2 min-h-[200px]">
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

            <div className="h-px w-full bg-sidebar-border" />

            <div className="space-y-4">
              <h3 className="font-semibold uppercase text-xs text-murici-text-secondary tracking-wider">Ferramentas</h3>
              {toolsLoading ? (
                <p className="text-muted-foreground text-xs">Carregando...</p>
              ) : (
                <div className="space-y-1">
                  <Accordion type="multiple" className="w-full border-none">
                    {Object.entries(groupedTools).map(([namespace, tools]) => (
                      <AccordionItem key={namespace} value={namespace} className="border-none">
                        <AccordionTrigger className="text-[13px] font-semibold text-murici-text-primary py-2 hover:no-underline tracking-wider">
                          {namespace}
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="flex flex-col gap-3 ml-2">
                            {tools.map((t: any) => (
                              <div key={t.name} className="text-[13px] text-murici-text-secondary leading-snug">
                                <span className="font-semibold text-murici-text-primary">{t.name}</span>
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
              <div className="rounded border border-red-500 bg-red-500/10 p-3 text-sm text-red-500 mt-4">
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
