"use client"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

// TODO: Separate into multiple contexts, keeping simple for now

import { ChatAgentSession, ChatbotUIContext } from "@/context/context"
import { getProfileByUserId } from "@/db/profile"
import { getWorkspacesByUserId } from "@/db/workspaces"
import {
  fetchHostedModels,
  fetchLocalModels,
  fetchOpenRouterModels
} from "@/lib/models/fetch-models"
import { Tables } from "@/types/database"
import {
  ChatFile,
  ChatMessage,
  ChatSettings,
  FlowEvent,
  FlowTurnDebug,
  LLM,
  MessageImage,
  OpenRouterLLM,
  WorkspaceImage
} from "@/types"
import { KnowledgeRecord } from "@/types/knowledge"
import { AssistantImage } from "@/types/images/assistant-image"
import { OsPendingAgentFile, UnpackPayload } from "@/types/electron"
import { VALID_ENV_KEYS } from "@/types/valid-keys"
import { patchFlowEventById } from "@/lib/utils/flow-events"
import { FC, useCallback, useEffect, useRef, useState } from "react"

interface GlobalStateProps {
  children: React.ReactNode
}

export const GlobalState: FC<GlobalStateProps> = ({ children }) => {
  // PROFILE STORE
  const [profile, setProfile] = useState<Tables<"profiles"> | null>(null)

  // ITEMS STORE
  const [assistants, setAssistants] = useState<Tables<"assistants">[]>([])
  const [chats, setChats] = useState<Tables<"chats">[]>([])
  const [files, setFiles] = useState<Tables<"files">[]>([])
  const [folders, setFolders] = useState<Tables<"folders">[]>([])
  const [models, setModels] = useState<Tables<"models">[]>([])
  const [workspaces, setWorkspaces] = useState<Tables<"workspaces">[]>([])

  // MODELS STORE
  const [envKeyMap, setEnvKeyMap] = useState<Record<string, boolean>>({})
  const [availableHostedModels, setAvailableHostedModels] = useState<LLM[]>([])
  const [availableLocalModels, setAvailableLocalModels] = useState<LLM[]>([])
  const [availableOpenRouterModels, setAvailableOpenRouterModels] = useState<
    OpenRouterLLM[]
  >([])
  const [backgroundModel, setBackgroundModel] = useState<LLM | null>(null)
  const [backgroundModelMissing, setBackgroundModelMissing] = useState(false)

  // WORKSPACE STORE
  const [selectedWorkspace, setSelectedWorkspace] =
    useState<Tables<"workspaces"> | null>(null)
  const [workspaceImages, setWorkspaceImages] = useState<WorkspaceImage[]>([])

  // ASSISTANT STORE
  const [selectedAssistant, setSelectedAssistant] =
    useState<Tables<"assistants"> | null>(null)
  const [assistantImages, setAssistantImages] = useState<AssistantImage[]>([])
  const [openaiAssistants, setOpenaiAssistants] = useState<any[]>([])

  // PASSIVE CHAT STORE
  const [userInput, setUserInput] = useState<string>("")
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatSettings, setChatSettings] = useState<ChatSettings>({
    model: "gpt-4o-mini",
    prompt: "You are a helpful AI assistant.",
    temperature: 0.5,
    contextLength: 4000,
    includeProfileContext: true,
    includeWorkspaceInstructions: true,
    embeddingsProvider: "openai"
  })
  useEffect(() => {
    const savedModel = localStorage.getItem("murici_selected_model")
    const savedPrompt = localStorage.getItem("murici_system_prompt")
    if (savedModel || savedPrompt) {
      setChatSettings(prev => ({
        ...prev,
        ...(savedModel && { model: savedModel }),
        ...(savedPrompt && { prompt: savedPrompt })
      }))
    }
  }, [])

  const [selectedChat, setSelectedChat] = useState<Tables<"chats"> | null>(null)
  const [chatFileItems, setChatFileItems] = useState<Tables<"file_items">[]>([])

  // ACTIVE CHAT STORE
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  const [firstTokenReceived, setFirstTokenReceived] = useState<boolean>(false)
  const [abortController, setAbortController] =
    useState<AbortController | null>(null)

  // CHAT INPUT COMMAND STORE
  const [isPromptPickerOpen, setIsPromptPickerOpen] = useState(false)
  const [slashCommand, setSlashCommand] = useState("")
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false)
  const [hashtagCommand, setHashtagCommand] = useState("")
  const [isToolPickerOpen, setIsToolPickerOpen] = useState(false)
  const [toolCommand, setToolCommand] = useState("")
  const [focusPrompt, setFocusPrompt] = useState(false)
  const [focusFile, setFocusFile] = useState(false)
  const [focusTool, setFocusTool] = useState(false)
  const [focusAssistant, setFocusAssistant] = useState(false)
  const [atCommand, setAtCommand] = useState("")
  const [isAssistantPickerOpen, setIsAssistantPickerOpen] = useState(false)

  // ATTACHMENTS STORE
  const [chatFiles, setChatFiles] = useState<ChatFile[]>([])
  const [chatImages, setChatImages] = useState<MessageImage[]>([])
  const [newMessageFiles, setNewMessageFiles] = useState<ChatFile[]>([])
  const [newMessageImages, setNewMessageImages] = useState<MessageImage[]>([])
  const [showSidebar, setShowSidebar] = useState<boolean>(false)
  const [showRightSidebar, setShowRightSidebar] = useState<boolean>(false)
  const [showDebugPanels, setShowDebugPanels] = useState<boolean>(false)
  const [osPendingAgentPayload, setOsPendingAgentPayload] = useState<OsPendingAgentFile | null>(null)
  const [pendingNewAgentPayload, setPendingNewAgentPayload] = useState<UnpackPayload | null>(null)
  const [isAgentBundleLoading, setIsAgentBundleLoading] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem("showSidebar")
    if (saved !== null) setShowSidebar(saved === "true")
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem("showDebugPanels")
    const isOn = saved === "true"
    if (saved !== null) setShowDebugPanels(isOn)
    window.electronAPI?.setDebugMode?.(isOn)
  }, [])

  // RETIEVAL STORE
  const [useRetrieval, setUseRetrieval] = useState<boolean>(true)
  const [sourceCount, setSourceCount] = useState<number>(4)

  // FLOW ENGINE STORE
  const [agentKnowledgeFiles, setAgentKnowledgeFiles] = useState<Array<{ path: string; content: string }>>([])
  const [agentPersona, setAgentPersona] = useState<string | null>(null)
  const [flowEngine, setFlowEngine] = useState<any | null>(null)
  const [flowState, setFlowState] = useState<{
    currentState: string
    goal?: string
    guide?: string
    teach?: string
    validIntents: string[]
  } | null>(null)
  const [flowDebugLog, setFlowDebugLog] = useState<
    Record<number, FlowTurnDebug>
  >({})

  // AGENT SESSION CACHE — keyed by agentSessionId (today === threadId). ADR-0007.
  //
  // The live KernelProxy (a WASM handle) lives HERE, in a ref, not in the channel
  // store: the store holds only serializable state. A session survives its channel
  // being unmounted, which is why switching chats and coming back keeps the agent
  // exactly where it was in its flow.
  //
  // There is no "__new__" bucket and no migrateChatAgentSession: a thread is born
  // with its final id (ChatHandlerProvider mints it), so the session key is stable
  // from the first moment. That migration step is what used to leak the previous
  // chat's agent into a new one (ADR-0002).
  const chatAgentSessionsRef = useRef<Map<string, ChatAgentSession>>(new Map())
  const activeChatKeyRef = useRef<string>("")
  const destroyChatAgentSession = useCallback((agentSessionId: string) => {
    const session = chatAgentSessionsRef.current.get(agentSessionId)
    if (session) {
      session.proxy.destroy()
      chatAgentSessionsRef.current.delete(agentSessionId)
    }
  }, [])
  // How a ChannelController writes back to its OWN session (e.g. the FSM advancing
  // on trigger_intent) without going through React state — so a background chat can
  // advance its agent without repainting the chat on screen.
  const updateChatAgentSession = useCallback(
    (agentSessionId: string, patch: Partial<ChatAgentSession>) => {
      const existing = chatAgentSessionsRef.current.get(agentSessionId)
      if (!existing) return
      chatAgentSessionsRef.current.set(agentSessionId, { ...existing, ...patch })
    },
    []
  )

  // THINKING LOG STORE
  const [thinkingLog, setThinkingLog] = useState<Record<string, string>>({})

  // KNOWLEDGE STORE
  const [knowledge, setKnowledge] = useState<KnowledgeRecord[]>([])

  // BACKGROUND QUEUE
  const [backgroundQueue, setBackgroundQueue] = useState<any[]>([])

  // FLOW EVENT LOG
  // Capped so a long session (many chats, lots of tool/debug traffic) doesn't
  // grow this array unboundedly — events are filtered per-chat for display
  // (see chat-messages.tsx), so trimming the oldest ones off the front only
  // drops debug history for chats the user is unlikely to revisit mid-session.
  const FLOW_EVENTS_CAP = 500
  const [flowEvents, setFlowEvents] = useState<FlowEvent[]>([])
  const addFlowEvent = useCallback(
    (e: FlowEvent) =>
      setFlowEvents(prev => {
        const next = [...prev, e]
        return next.length > FLOW_EVENTS_CAP
          ? next.slice(next.length - FLOW_EVENTS_CAP)
          : next
      }),
    []
  )
  const updateFlowEvent = useCallback(
    (id: string, patch: Record<string, any>) =>
      setFlowEvents(prev => patchFlowEventById(prev, id, patch)),
    []
  )

  useEffect(() => {
    ;(async () => {
      // fetchLocalModels doesn't depend on the profile, but used to run
      // only after the whole profile -> hosted-models -> openrouter-models
      // chain finished — so sending a chat message to a local model right
      // after page load, before that chain settled, would fail with
      // "Custom model base_url is required" (resolveCustomModel couldn't
      // find it in the still-empty availableLocalModels). Run it in
      // parallel so local models are available as early as possible.
      const [profile, localModels] = await Promise.all([
        fetchStartingData(),
        fetchLocalModels()
      ])
      setAvailableLocalModels(localModels)

      let hostedModels: LLM[] = []
      let openRouterModels: OpenRouterLLM[] = []

      if (profile) {
        const hostedModelRes = await fetchHostedModels(profile)
        if (hostedModelRes) {
          hostedModels = hostedModelRes.hostedModels
          setEnvKeyMap(hostedModelRes.envKeyMap)
          setAvailableHostedModels(hostedModelRes.hostedModels)

          if (
            profile["openrouter_api_key"] ||
            hostedModelRes.envKeyMap["openrouter"]
          ) {
            const fetched = await fetchOpenRouterModels()
            if (fetched) {
              openRouterModels = fetched
              setAvailableOpenRouterModels(fetched)
            }
          }
        }
      }

      // The selected model may come from localStorage (a previous session)
      // and could name a model a provider has since deprecated/removed —
      // fall back to the first live-discovered model instead of silently
      // trying a dead id on the first send.
      const knownModels = [...localModels, ...hostedModels, ...openRouterModels]
      if (knownModels.length > 0) {
        setChatSettings(prev => {
          const stillValid = knownModels.some(
            m => !m.disabled && m.modelId === prev.model
          )
          if (stillValid) return prev
          const fallback = knownModels.find(m => !m.disabled)
          return fallback ? { ...prev, model: fallback.modelId } : prev
        })
      }

      const savedId = profile?.background_model_id
      if (savedId) {
        const found = localModels.find(m => m.modelId === savedId)
        if (found) {
          setBackgroundModel(found)
        } else {
          setBackgroundModelMissing(true)
          window.dispatchEvent(new CustomEvent("murici:profile-open"))
        }
      }
    })()
  }, [])

  const fetchStartingData = async () => {
    const profile = await getProfileByUserId("local")
    setProfile(profile)

    const workspaces = await getWorkspacesByUserId("local")
    setWorkspaces(workspaces)

    return profile
  }

  return (
    <ChatbotUIContext.Provider
      value={{
        // PROFILE STORE
        profile,
        setProfile,

        // ITEMS STORE
        assistants,
        setAssistants,
        chats,
        setChats,
        files,
        setFiles,
        folders,
        setFolders,
        models,
        setModels,
        workspaces,
        setWorkspaces,

        // MODELS STORE
        envKeyMap,
        setEnvKeyMap,
        availableHostedModels,
        setAvailableHostedModels,
        availableLocalModels,
        setAvailableLocalModels,
        availableOpenRouterModels,
        setAvailableOpenRouterModels,
        backgroundModel,
        setBackgroundModel,
        backgroundModelMissing,
        setBackgroundModelMissing,

        // WORKSPACE STORE
        selectedWorkspace,
        setSelectedWorkspace,
        workspaceImages,
        setWorkspaceImages,

        // ASSISTANT STORE
        selectedAssistant,
        setSelectedAssistant,
        assistantImages,
        setAssistantImages,
        openaiAssistants,
        setOpenaiAssistants,

        // PASSIVE CHAT STORE
        userInput,
        setUserInput,
        chatMessages,
        setChatMessages,
        chatSettings,
        setChatSettings,
        selectedChat,
        setSelectedChat,
        chatFileItems,
        setChatFileItems,

        // ACTIVE CHAT STORE
        isGenerating,
        setIsGenerating,
        firstTokenReceived,
        setFirstTokenReceived,
        abortController,
        setAbortController,

        // CHAT INPUT COMMAND STORE
        isPromptPickerOpen,
        setIsPromptPickerOpen,
        slashCommand,
        setSlashCommand,
        isFilePickerOpen,
        setIsFilePickerOpen,
        hashtagCommand,
        setHashtagCommand,
        isToolPickerOpen,
        setIsToolPickerOpen,
        toolCommand,
        setToolCommand,
        focusPrompt,
        setFocusPrompt,
        focusFile,
        setFocusFile,
        focusTool,
        setFocusTool,
        focusAssistant,
        setFocusAssistant,
        atCommand,
        setAtCommand,
        isAssistantPickerOpen,
        setIsAssistantPickerOpen,

        // ATTACHMENT STORE
        chatFiles,
        setChatFiles,
        chatImages,
        setChatImages,
        newMessageFiles,
        setNewMessageFiles,
        newMessageImages,
        setNewMessageImages,
        showSidebar,
        setShowSidebar,
        showRightSidebar,
        setShowRightSidebar,
        showDebugPanels,
        setShowDebugPanels,
        osPendingAgentPayload,
        setOsPendingAgentPayload,
        pendingNewAgentPayload,
        setPendingNewAgentPayload,
        isAgentBundleLoading,
        setIsAgentBundleLoading,

        // RETRIEVAL STORE
        useRetrieval,
        setUseRetrieval,
        sourceCount,
        setSourceCount,

        // FLOW ENGINE STORE
        agentKnowledgeFiles,
        setAgentKnowledgeFiles,
        agentPersona,
        setAgentPersona,
        flowEngine,
        setFlowEngine,
        flowState,
        setFlowState,
        flowDebugLog,
        setFlowDebugLog,

        // AGENT SESSION CACHE (keyed by agentSessionId)
        chatAgentSessionsRef,
        activeChatKeyRef,
        destroyChatAgentSession,
        updateChatAgentSession,

        // THINKING LOG STORE
        thinkingLog,
        setThinkingLog,

        // FLOW EVENT LOG
        flowEvents,
        addFlowEvent,
        updateFlowEvent,

        // KNOWLEDGE STORE
        knowledge,
        setKnowledge,

        // BACKGROUND QUEUE
        backgroundQueue,
        setBackgroundQueue
      }}
    >
      {children}
    </ChatbotUIContext.Provider>
  )
}
