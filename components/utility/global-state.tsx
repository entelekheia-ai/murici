/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

// TODO: Separate into multiple contexts, keeping simple for now

"use client"

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
import { saveAgentBundle } from "@/lib/local-db/agent-bundles"
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
    model: "gpt-4-turbo-preview",
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

  useEffect(() => {
    const saved = localStorage.getItem("showSidebar")
    if (saved !== null) setShowSidebar(saved === "true")
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem("showDebugPanels")
    if (saved !== null) setShowDebugPanels(saved === "true")
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

  // AGENT SESSION CACHE (per chat)
  const chatAgentSessionsRef = useRef<Map<string, ChatAgentSession>>(new Map())
  const activeChatKeyRef = useRef<string>("__new__")
  const destroyChatAgentSession = useCallback((chatId: string) => {
    const session = chatAgentSessionsRef.current.get(chatId)
    if (session) {
      session.proxy.destroy()
      chatAgentSessionsRef.current.delete(chatId)
    }
  }, [])
  const migrateChatAgentSession = useCallback(
    (fromChatId: string, toChatId: string) => {
      if (fromChatId === toChatId) return
      const fromSession = chatAgentSessionsRef.current.get(fromChatId)
      if (!fromSession) return
      const staleTarget = chatAgentSessionsRef.current.get(toChatId)
      if (staleTarget && staleTarget !== fromSession) {
        staleTarget.proxy.destroy()
      }
      chatAgentSessionsRef.current.delete(fromChatId)
      chatAgentSessionsRef.current.set(toChatId, fromSession)

      // "__new__" (and other transient buckets) can't be persisted until
      // they're attached to a real chat id — do it now that toChatId is one.
      if (fromSession.agentMeta) {
        saveAgentBundle(toChatId, {
          aboutme: fromSession.agentMeta,
          behaviorText: fromSession.behaviorText,
          descriptionText: fromSession.descriptionText,
          knowledge: fromSession.knowledge,
          guides: fromSession.guides,
          behaviors: fromSession.behaviors
        }).catch(err =>
          console.error("[agent-bundle] failed to persist migrated bundle", err)
        )
      }
    },
    []
  )

  // THINKING LOG STORE
  const [thinkingLog, setThinkingLog] = useState<Record<number, string>>({})

  // KNOWLEDGE STORE
  const [knowledge, setKnowledge] = useState<KnowledgeRecord[]>([])

  // BACKGROUND QUEUE
  const [backgroundQueue, setBackgroundQueue] = useState<any[]>([])

  // FLOW EVENT LOG
  const [flowEvents, setFlowEvents] = useState<FlowEvent[]>([])
  const addFlowEvent = useCallback(
    (e: FlowEvent) => setFlowEvents(prev => [...prev, e]),
    []
  )

  useEffect(() => {
    ;(async () => {
      const profile = await fetchStartingData()

      if (profile) {
        const hostedModelRes = await fetchHostedModels(profile)
        if (!hostedModelRes) return

        setEnvKeyMap(hostedModelRes.envKeyMap)
        setAvailableHostedModels(hostedModelRes.hostedModels)

        if (
          profile["openrouter_api_key"] ||
          hostedModelRes.envKeyMap["openrouter"]
        ) {
          const openRouterModels = await fetchOpenRouterModels()
          if (!openRouterModels) return
          setAvailableOpenRouterModels(openRouterModels)
        }
      }

      const localModels = await fetchLocalModels()
      setAvailableLocalModels(localModels)

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

        // AGENT SESSION CACHE (per chat)
        chatAgentSessionsRef,
        activeChatKeyRef,
        destroyChatAgentSession,
        migrateChatAgentSession,

        // THINKING LOG STORE
        thinkingLog,
        setThinkingLog,

        // FLOW EVENT LOG
        flowEvents,
        addFlowEvent,

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
