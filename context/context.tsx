/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { Tables } from "@/types/database"
import {
  ChatFile,
  ChatMessage,
  ChatSettings,
  LLM,
  MessageImage,
  OpenRouterLLM,
  WorkspaceImage
} from "@/types"
import { FlowEvent, FlowTurnDebug } from "@/types"
import { KnowledgeRecord } from "@/types/knowledge"
import { AssistantImage } from "@/types/images/assistant-image"
import { AgentAboutme, OsPendingAgentFile, UnpackPayload } from "@/types/electron"
import { VALID_ENV_KEYS } from "@/types/valid-keys"
import { KernelProxy } from "@/lib/kernel-proxy"
import { Dispatch, MutableRefObject, SetStateAction, createContext } from "react"

export interface ChatAgentSession {
  proxy: KernelProxy
  agentMeta: AgentAboutme | null
  behaviorText: string
  descriptionText: string
  currentState: string
  graphData: string | null
  visitedOrder: string[]
  parseError: string | null
  knowledge: Array<{ path: string; content: string }>
  guides: Array<{ path: string; content: string }>
  behaviors: Array<{ path: string; content: string }>
  flowState: {
    currentState: string
    goal?: string
    guide?: string
    teach?: string
    validIntents: string[]
    graph?: string | null
  } | null
}

interface ChatbotUIContext {
  // PROFILE STORE
  profile: Tables<"profiles"> | null
  setProfile: Dispatch<SetStateAction<Tables<"profiles"> | null>>

  // ITEMS STORE
  assistants: Tables<"assistants">[]
  setAssistants: Dispatch<SetStateAction<Tables<"assistants">[]>>
  chats: Tables<"chats">[]
  setChats: Dispatch<SetStateAction<Tables<"chats">[]>>
  files: Tables<"files">[]
  setFiles: Dispatch<SetStateAction<Tables<"files">[]>>
  folders: Tables<"folders">[]
  setFolders: Dispatch<SetStateAction<Tables<"folders">[]>>
  models: Tables<"models">[]
  setModels: Dispatch<SetStateAction<Tables<"models">[]>>
  workspaces: Tables<"workspaces">[]
  setWorkspaces: Dispatch<SetStateAction<Tables<"workspaces">[]>>

  // MODELS STORE
  envKeyMap: Record<string, boolean>
  setEnvKeyMap: Dispatch<SetStateAction<Record<string, boolean>>>
  availableHostedModels: LLM[]
  setAvailableHostedModels: Dispatch<SetStateAction<LLM[]>>
  availableLocalModels: LLM[]
  setAvailableLocalModels: Dispatch<SetStateAction<LLM[]>>
  availableOpenRouterModels: OpenRouterLLM[]
  setAvailableOpenRouterModels: Dispatch<SetStateAction<OpenRouterLLM[]>>
  backgroundModel: LLM | null
  setBackgroundModel: Dispatch<SetStateAction<LLM | null>>
  backgroundModelMissing: boolean
  setBackgroundModelMissing: Dispatch<SetStateAction<boolean>>

  // WORKSPACE STORE
  selectedWorkspace: Tables<"workspaces"> | null
  setSelectedWorkspace: Dispatch<SetStateAction<Tables<"workspaces"> | null>>
  workspaceImages: WorkspaceImage[]
  setWorkspaceImages: Dispatch<SetStateAction<WorkspaceImage[]>>

  // ASSISTANT STORE
  selectedAssistant: Tables<"assistants"> | null
  setSelectedAssistant: Dispatch<SetStateAction<Tables<"assistants"> | null>>
  assistantImages: AssistantImage[]
  setAssistantImages: Dispatch<SetStateAction<AssistantImage[]>>
  openaiAssistants: any[]
  setOpenaiAssistants: Dispatch<SetStateAction<any[]>>

  // PASSIVE CHAT STORE
  userInput: string
  setUserInput: Dispatch<SetStateAction<string>>
  chatMessages: ChatMessage[]
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>
  chatSettings: ChatSettings | null
  setChatSettings: Dispatch<SetStateAction<ChatSettings>>
  selectedChat: Tables<"chats"> | null
  setSelectedChat: Dispatch<SetStateAction<Tables<"chats"> | null>>
  chatFileItems: Tables<"file_items">[]
  setChatFileItems: Dispatch<SetStateAction<Tables<"file_items">[]>>

  // ACTIVE CHAT STORE
  abortController: AbortController | null
  setAbortController: Dispatch<SetStateAction<AbortController | null>>
  firstTokenReceived: boolean
  setFirstTokenReceived: Dispatch<SetStateAction<boolean>>
  isGenerating: boolean
  setIsGenerating: Dispatch<SetStateAction<boolean>>

  // CHAT INPUT COMMAND STORE
  isPromptPickerOpen: boolean
  setIsPromptPickerOpen: Dispatch<SetStateAction<boolean>>
  slashCommand: string
  setSlashCommand: Dispatch<SetStateAction<string>>
  isFilePickerOpen: boolean
  setIsFilePickerOpen: Dispatch<SetStateAction<boolean>>
  hashtagCommand: string
  setHashtagCommand: Dispatch<SetStateAction<string>>
  isToolPickerOpen: boolean
  setIsToolPickerOpen: Dispatch<SetStateAction<boolean>>
  toolCommand: string
  setToolCommand: Dispatch<SetStateAction<string>>
  focusPrompt: boolean
  setFocusPrompt: Dispatch<SetStateAction<boolean>>
  focusFile: boolean
  setFocusFile: Dispatch<SetStateAction<boolean>>
  focusTool: boolean
  setFocusTool: Dispatch<SetStateAction<boolean>>
  focusAssistant: boolean
  setFocusAssistant: Dispatch<SetStateAction<boolean>>
  atCommand: string
  setAtCommand: Dispatch<SetStateAction<string>>
  isAssistantPickerOpen: boolean
  setIsAssistantPickerOpen: Dispatch<SetStateAction<boolean>>

  // ATTACHMENTS STORE
  chatFiles: ChatFile[]
  setChatFiles: Dispatch<SetStateAction<ChatFile[]>>
  chatImages: MessageImage[]
  setChatImages: Dispatch<SetStateAction<MessageImage[]>>
  newMessageFiles: ChatFile[]
  setNewMessageFiles: Dispatch<SetStateAction<ChatFile[]>>
  newMessageImages: MessageImage[]
  setNewMessageImages: Dispatch<SetStateAction<MessageImage[]>>
  showSidebar: boolean
  setShowSidebar: Dispatch<SetStateAction<boolean>>
  showRightSidebar: boolean
  setShowRightSidebar: Dispatch<SetStateAction<boolean>>
  showDebugPanels: boolean
  setShowDebugPanels: Dispatch<SetStateAction<boolean>>
  osPendingAgentPayload: OsPendingAgentFile | null
  setOsPendingAgentPayload: Dispatch<SetStateAction<OsPendingAgentFile | null>>
  // Bridge for "open this agent in a brand-new chat" requests originating
  // from the left-sidebar Agentes panel — distinct from osPendingAgentPayload
  // (OS "open with"), which goes through an ambiguous this-chat-or-new-chat
  // prompt instead of always landing on a new chat.
  pendingNewAgentPayload: UnpackPayload | null
  setPendingNewAgentPayload: Dispatch<SetStateAction<UnpackPayload | null>>

  // RETRIEVAL STORE
  useRetrieval: boolean
  setUseRetrieval: Dispatch<SetStateAction<boolean>>
  sourceCount: number
  setSourceCount: Dispatch<SetStateAction<number>>

  // FLOW ENGINE STORE
  agentKnowledgeFiles: Array<{ path: string; content: string }>
  setAgentKnowledgeFiles: Dispatch<SetStateAction<Array<{ path: string; content: string }>>>
  agentPersona: string | null
  setAgentPersona: Dispatch<SetStateAction<string | null>>
  flowEngine: any | null
  setFlowEngine: Dispatch<SetStateAction<any | null>>
  flowState: {
    currentState: string
    goal?: string
    guide?: string
    teach?: string
    validIntents: string[]
    graph?: string | null
  } | null
  setFlowState: Dispatch<
    SetStateAction<{
      currentState: string
      goal?: string
      guide?: string
      teach?: string
      validIntents: string[]
      graph?: string | null
    } | null>
  >
  flowDebugLog: Record<number, FlowTurnDebug>
  setFlowDebugLog: Dispatch<SetStateAction<Record<number, FlowTurnDebug>>>

  // AGENT SESSION CACHE (per chat)
  chatAgentSessionsRef: MutableRefObject<Map<string, ChatAgentSession>>
  activeChatKeyRef: MutableRefObject<string>
  destroyChatAgentSession: (chatId: string) => void
  migrateChatAgentSession: (fromChatId: string, toChatId: string) => void

  // Incremented whenever a "new chat" action starts (see ChatHandlerProvider's
  // handleNewChat). AgentSessionProvider watches this to reset the "__new__"
  // agent session — chat-level and agent-level providers are siblings that
  // only share GlobalState, so this signal is how the chat side notifies the
  // agent side without either importing the other's context.
  newChatSignal: number
  setNewChatSignal: Dispatch<SetStateAction<number>>

  // THINKING LOG STORE — keyed by message id (stable across the streaming ->
  // persisted handoff), not sequence_number (which was recomputed in several
  // places and diverged, making the <think> block vanish when a stream ended).
  thinkingLog: Record<string, string>
  setThinkingLog: Dispatch<SetStateAction<Record<string, string>>>

  // FLOW EVENT LOG
  flowEvents: FlowEvent[]
  addFlowEvent: (event: FlowEvent) => void
  updateFlowEvent: (id: string, patch: Record<string, any>) => void

  // KNOWLEDGE STORE
  knowledge: KnowledgeRecord[]
  setKnowledge: Dispatch<SetStateAction<KnowledgeRecord[]>>

  // BACKGROUND QUEUE
  backgroundQueue: any[]
  setBackgroundQueue: Dispatch<SetStateAction<any[]>>
}

export const ChatbotUIContext = createContext<ChatbotUIContext>({
  // PROFILE STORE
  profile: null,
  setProfile: () => {},

  // ITEMS STORE
  assistants: [],
  setAssistants: () => {},
  chats: [],
  setChats: () => {},
  files: [],
  setFiles: () => {},
  folders: [],
  setFolders: () => {},
  models: [],
  setModels: () => {},
  workspaces: [],
  setWorkspaces: () => {},

  // MODELS STORE
  envKeyMap: {},
  setEnvKeyMap: () => {},
  availableHostedModels: [],
  setAvailableHostedModels: () => {},
  availableLocalModels: [],
  setAvailableLocalModels: () => {},
  availableOpenRouterModels: [],
  setAvailableOpenRouterModels: () => {},
  backgroundModel: null,
  setBackgroundModel: () => {},
  backgroundModelMissing: false,
  setBackgroundModelMissing: () => {},

  // WORKSPACE STORE
  selectedWorkspace: null,
  setSelectedWorkspace: () => {},
  workspaceImages: [],
  setWorkspaceImages: () => {},

  // ASSISTANT STORE
  selectedAssistant: null,
  setSelectedAssistant: () => {},
  assistantImages: [],
  setAssistantImages: () => {},
  openaiAssistants: [],
  setOpenaiAssistants: () => {},

  // PASSIVE CHAT STORE
  userInput: "",
  setUserInput: () => {},
  selectedChat: null,
  setSelectedChat: () => {},
  chatMessages: [],
  setChatMessages: () => {},
  chatSettings: null,
  setChatSettings: () => {},
  chatFileItems: [],
  setChatFileItems: () => {},

  // ACTIVE CHAT STORE
  isGenerating: false,
  setIsGenerating: () => {},
  firstTokenReceived: false,
  setFirstTokenReceived: () => {},
  abortController: null,
  setAbortController: () => {},

  // CHAT INPUT COMMAND STORE
  isPromptPickerOpen: false,
  setIsPromptPickerOpen: () => {},
  slashCommand: "",
  setSlashCommand: () => {},
  isFilePickerOpen: false,
  setIsFilePickerOpen: () => {},
  hashtagCommand: "",
  setHashtagCommand: () => {},
  isToolPickerOpen: false,
  setIsToolPickerOpen: () => {},
  toolCommand: "",
  setToolCommand: () => {},
  focusPrompt: false,
  setFocusPrompt: () => {},
  focusFile: false,
  setFocusFile: () => {},
  focusTool: false,
  setFocusTool: () => {},
  focusAssistant: false,
  setFocusAssistant: () => {},
  atCommand: "",
  setAtCommand: () => {},
  isAssistantPickerOpen: false,
  setIsAssistantPickerOpen: () => {},

  // ATTACHMENTS STORE
  chatFiles: [],
  setChatFiles: () => {},
  chatImages: [],
  setChatImages: () => {},
  newMessageFiles: [],
  setNewMessageFiles: () => {},
  newMessageImages: [],
  setNewMessageImages: () => {},
  showSidebar: false,
  setShowSidebar: () => {},
  showRightSidebar: false,
  setShowRightSidebar: () => {},
  showDebugPanels: false,
  setShowDebugPanels: () => {},
  osPendingAgentPayload: null,
  setOsPendingAgentPayload: () => {},
  pendingNewAgentPayload: null,
  setPendingNewAgentPayload: () => {},

  // RETRIEVAL STORE
  useRetrieval: false,
  setUseRetrieval: () => {},
  sourceCount: 4,
  setSourceCount: () => {},

  // FLOW ENGINE STORE
  agentKnowledgeFiles: [],
  setAgentKnowledgeFiles: () => {},
  agentPersona: null,
  setAgentPersona: () => {},
  flowEngine: null,
  setFlowEngine: () => {},
  flowState: null,
  setFlowState: () => {},
  flowDebugLog: {},
  setFlowDebugLog: () => {},

  // AGENT SESSION CACHE (per chat)
  chatAgentSessionsRef: { current: new Map() },
  activeChatKeyRef: { current: "__new__" },
  destroyChatAgentSession: () => {},
  migrateChatAgentSession: () => {},
  newChatSignal: 0,
  setNewChatSignal: () => {},

  // THINKING LOG STORE
  thinkingLog: {},
  setThinkingLog: () => {},

  // FLOW EVENT LOG
  flowEvents: [],
  addFlowEvent: () => {},
  updateFlowEvent: () => {},

  // KNOWLEDGE STORE
  knowledge: [],
  setKnowledge: () => {},

  // BACKGROUND QUEUE
  backgroundQueue: [],
  setBackgroundQueue: () => {}
})
