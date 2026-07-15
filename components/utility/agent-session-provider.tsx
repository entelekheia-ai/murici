"use client"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { AgentSessionContext } from "@/context/agent-session-context"
import { ChatAgentSession, ChatbotUIContext } from "@/context/context"
import { KernelProxy } from "@/lib/kernel-proxy"
import { handleKernelEffects } from "@/lib/kernel-effects"
import { getAgentBundle, saveAgentBundle } from "@/lib/local-db/agent-bundles"
import { upsertRecentAgent } from "@/lib/local-db/recent-agents"
import { buildFlowStateFromEffects } from "@/lib/runtime/advance-flow"
import { useChannelStore } from "@/lib/store/channel-store"
import { unpackAgentFile } from "@/lib/agents/unpack-agent-file"
import type { AgentAboutme, UnpackPayload } from "@/types/electron"
import { FC, useCallback, useContext, useEffect, useRef, useState } from "react"

interface AgentSessionProviderProps {
  children: React.ReactNode
}

// Single owner of the agent-FSM session view state and its lifecycle
// (create/reset/load/advance). Mounted once near the app root so it stays
// alive independent of whether RightSidebar (the panel that renders this
// state) is currently mounted, and so any hook — not just RightSidebar's
// own closures — can trigger a real, view-synced reset.
export const AgentSessionProvider: FC<AgentSessionProviderProps> = ({
  children
}) => {
  const {
    chatAgentSessionsRef,
    activeChatKeyRef,
    destroyChatAgentSession,
    setFlowState,
    setFlowEngine,
    flowState,
    setAgentKnowledgeFiles,
    setAgentPersona,
    setShowRightSidebar,
    setIsAgentBundleLoading
  } = useContext(ChatbotUIContext)

  // Which thread is on screen. Published by ChatHandlerProvider (ADR-0007) — the
  // agent side keys its sessions by the SAME id the channel side streams under, so
  // there is exactly one answer to "which thread is active", with no second source
  // of truth and no "__new__" bucket.
  const viewedThreadId = useChannelStore(s => s.viewedThreadId)

  const [engine, setEngine] = useState<any>(null)
  const [currentState, setCurrentState] = useState<string>("")
  const [graphData, setGraphData] = useState<string | null>(null)
  const [visitedOrder, setVisitedOrder] = useState<string[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [behaviorText, setBehaviorText] = useState("")
  const [descriptionText, setDescriptionText] = useState("")
  const [agentMeta, setAgentMeta] = useState<AgentAboutme | null>(null)
  const [agentLoading, setAgentLoading] = useState(false)
  const [behaviors, setBehaviors] = useState<
    Array<{ path: string; content: string }>
  >([])

  const engineRef = useRef<any>(null)
  const visitedRef = useRef<string[]>([])
  const pendingNewChatPayloadRef = useRef<UnpackPayload | null>(null)

  const getOrCreateSession = useCallback(
    (chatKey: string): ChatAgentSession => {
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
    },
    [chatAgentSessionsRef]
  )

  const updateSession = useCallback(
    (chatKey: string, patch: Partial<ChatAgentSession>) => {
      const existing = chatAgentSessionsRef.current.get(chatKey)
      if (!existing) return
      chatAgentSessionsRef.current.set(chatKey, { ...existing, ...patch })
    },
    [chatAgentSessionsRef]
  )

  const applySessionToView = useCallback(
    (session: ChatAgentSession) => {
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
    },
    [setFlowEngine, setAgentPersona, setAgentKnowledgeFiles, setFlowState]
  )

  const loadBehavior = useCallback(
    async (
      chatKey: string,
      eng: any,
      text: string,
      know: Array<{ path: string; content: string }> = [],
      guides: Array<{ path: string; content: string }> = [],
      behaviorsArg: Array<{ path: string; content: string }> = [],
      initialMemory: Array<{ domain: string; key: string; value: string }> = []
    ) => {
      const isActive = () => chatKey === activeChatKeyRef.current
      if (isActive()) setParseError(null)

      try {
        const effects = await eng.load_behavior(
          text,
          know,
          guides,
          behaviorsArg,
          initialMemory
        )

        const parseErrorEffect = effects.find(
          (e: any) => e.type === "parse_error"
        )
        if (parseErrorEffect) {
          updateSession(chatKey, { parseError: parseErrorEffect.message })
          if (isActive()) setParseError(parseErrorEffect.message)
          return
        }

        if (isActive()) handleKernelEffects(effects, { setShowRightSidebar })

        const newFlowState = buildFlowStateFromEffects(eng, effects, know)
        const state = newFlowState.currentState
        const graph = newFlowState.graph ?? null

        updateSession(chatKey, {
          knowledge: know,
          guides,
          behaviors: behaviorsArg,
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
          setBehaviors(behaviorsArg)
        }
      } catch (e: any) {
        const message = e.message || "Failed to load behavior"
        updateSession(chatKey, { parseError: message })
        if (isActive()) setParseError(message)
      }
    },
    [activeChatKeyRef, updateSession, setShowRightSidebar, setAgentKnowledgeFiles, setFlowState]
  )

  // Sync the FSM's advancing state (driven by send_intent/tick_prompt calls
  // elsewhere) back into both the session cache and, if this is the active
  // chat, the view.
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
      graphData:
        freshGraph || chatAgentSessionsRef.current.get(chatKey)?.graphData || null,
      flowState
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowState?.currentState])

  const loadAgentBundle = useCallback(
    async (
      payload: UnpackPayload,
      targetChatKey?: string,
      initialMemory: Array<{ domain: string; key: string; value: string }> = []
    ) => {
      const chatKey = targetChatKey ?? activeChatKeyRef.current
      const isActiveTarget = chatKey === activeChatKeyRef.current
      if (isActiveTarget) setIsAgentBundleLoading(true)
      try {
        const session = getOrCreateSession(chatKey)
        updateSession(chatKey, {
          agentMeta: payload.aboutme,
          behaviorText: payload.behaviorText,
          descriptionText: payload.descriptionText || ""
        })
        if (isActiveTarget) {
          setAgentMeta(payload.aboutme)
          setAgentPersona(payload.aboutme.persona || null)
          setBehaviorText(payload.behaviorText)
          setDescriptionText(payload.descriptionText || "")
        }
        await loadBehavior(
          chatKey,
          session.proxy,
          payload.behaviorText,
          payload.knowledge,
          payload.guides,
          payload.behaviors,
          initialMemory
        )

        // Persist the bundle so the agent can be rebuilt after a reload wipes the
        // in-memory session map. A thread is born with its final id, so this can
        // just save under `chatKey` — there is no transient bucket to migrate from.
        //
        // NOTE (revival semantics, decided in ADR-0007): a reload rebuilds the agent
        // at the FSM's **initial state**, not where the conversation had actually
        // reached. Only the bundle is persisted, not the kernel's live state. Coming
        // back exactly where it stopped needs **kernel state serialization**, which
        // is on the dot-agent backlog; when that ships, this is the one place that
        // changes (persist + restore the kernel state alongside the bundle).
        // Within a session this does not bite: the KernelProxy stays alive in
        // chatAgentSessionsRef, so switching chats and coming back preserves the
        // agent's position in its flow.
        saveAgentBundle(chatKey, payload).catch(err =>
          console.error("[agent-bundle] failed to persist bundle", err)
        )
      } finally {
        if (isActiveTarget) setIsAgentBundleLoading(false)
      }
    },
    [
      activeChatKeyRef,
      getOrCreateSession,
      updateSession,
      setAgentPersona,
      loadBehavior,
      setIsAgentBundleLoading
    ]
  )

  // The single place that tears a chat's session down and, if it's the one
  // currently on screen, brings the view back to a blank slate in the same
  // tick. Both "start a new chat" and "swap a different agent into the
  // unsaved bucket" go through this instead of each re-implementing it.
  const resetSession = useCallback(
    (chatKey: string) => {
      destroyChatAgentSession(chatKey)
      const fresh = getOrCreateSession(chatKey)
      if (chatKey === activeChatKeyRef.current) applySessionToView(fresh)
    },
    [destroyChatAgentSession, getOrCreateSession, applySessionToView, activeChatKeyRef]
  )

  // No "new chat" signal is needed any more. Starting a new chat mints a NEW
  // thread id (ChatHandlerProvider), and a new id has no session — so the effect
  // below simply builds a blank one and applies it. The old newChatSignal +
  // resetSession("__new__") dance existed only because every unsent chat reused
  // one shared "__new__" bucket that had to be scrubbed between chats.

  const hasActiveAgent = useCallback(
    (chatKey: string) => !!chatAgentSessionsRef.current.get(chatKey)?.agentMeta,
    [chatAgentSessionsRef]
  )

  const queueNewChatPayload = useCallback((payload: UnpackPayload) => {
    pendingNewChatPayloadRef.current = payload
  }, [])

  // Swap the VIEWED agent session whenever the thread on screen changes, so each
  // thread keeps its own KernelProxy/sessionId instead of sharing a global one.
  //
  // This only moves what the VIEW shows. A background chat's session keeps living
  // in the map and keeps being advanced by its own ChannelController — which reads
  // it by agentSessionId and never through this projection. That separation is the
  // fix for the "offtopic" leak: what is on screen no longer decides which agent a
  // request travels with.
  useEffect(() => {
    if (!viewedThreadId) return
    const chatKey = viewedThreadId
    const isFreshSession = !chatAgentSessionsRef.current.has(chatKey)
    activeChatKeyRef.current = chatKey
    const session = getOrCreateSession(chatKey)
    applySessionToView(session)

    if (pendingNewChatPayloadRef.current) {
      const payload = pendingNewChatPayloadRef.current
      pendingNewChatPayloadRef.current = null
      loadAgentBundle(payload, chatKey)
    } else if (isFreshSession) {
      // First time this thread's session is built in this tab (e.g. right after a
      // reload) — rebuild any agent bundle it had. See the revival note in
      // loadAgentBundle: this lands at the FSM's INITIAL state, because only the
      // bundle is persisted, not the kernel's live state (dot-agent backlog).
      // A brand-new, unsent thread simply has no bundle, so this is a no-op for it.
      getAgentBundle(chatKey).then(bundle => {
        if (!bundle) return
        if (chatAgentSessionsRef.current.get(chatKey)?.agentMeta) return
        loadAgentBundle(bundle, chatKey)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedThreadId])

  const handleAgentFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".agent")) return
      setAgentLoading(true)
      try {
        // Electron 32+ removed the non-standard `.path` on File objects; the
        // replacement is webUtils.getPathForFile, bridged from preload.ts.
        // Absent in a plain web build, where browsers don't expose real
        // filesystem paths.
        const electronPath = window.electronAPI?.getPathForFile?.(file)

        const payload = await unpackAgentFile(file)
        await loadAgentBundle(payload)
        setShowRightSidebar(true)
        upsertRecentAgent({
          filePath: electronPath ?? null,
          aboutme: payload.aboutme
        }).catch(err =>
          console.error("[recent-agents] upsert failed", err)
        )
      } catch (err: any) {
        setParseError(err.message || "Failed to load agent")
      } finally {
        setAgentLoading(false)
      }
    },
    [loadAgentBundle, setShowRightSidebar]
  )

  return (
    <AgentSessionContext.Provider
      value={{
        engine,
        currentState,
        graphData,
        visitedOrder,
        parseError,
        behaviorText,
        descriptionText,
        agentMeta,
        agentLoading,
        behaviors,
        setParseError,
        loadAgentBundle,
        handleAgentFile,
        resetSession,
        hasActiveAgent,
        queueNewChatPayload
      }}
    >
      {children}
    </AgentSessionContext.Provider>
  )
}
