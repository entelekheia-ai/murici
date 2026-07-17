/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { AgentAboutme, UnpackPayload } from "@/types/electron"
import { Dispatch, SetStateAction, createContext } from "react"

// Owns the agent-FSM session state that used to live as local useState in
// RightSidebar. Lifted into its own Provider (mounted once near the app
// root, alongside GlobalState) so it survives RightSidebar mounting/
// unmounting (the panel is only rendered while showRightSidebar is true)
// and so non-rendering hooks (useChatHandler) can trigger a real session
// reset instead of writing into a ref no view is reading.
export interface AgentSessionContextType {
  engine: any
  currentState: string
  graphData: string | null
  visitedOrder: string[]
  parseError: string | null
  behaviorText: string
  descriptionText: string
  agentMeta: AgentAboutme | null
  agentLoading: boolean
  behaviors: Array<{ path: string; content: string }>
  setParseError: Dispatch<SetStateAction<string | null>>

  // Loads a bundle (from a .agent file, an OS "open with", or a restored
  // IndexedDB record) into the given chat's session, defaulting to the
  // currently active chat.
  loadAgentBundle: (
    payload: UnpackPayload,
    targetChatKey?: string,
    initialMemory?: Array<{ domain: string; key: string; value: string }>
  ) => Promise<void>

  // Unpacks a raw .agent File (from the file picker or drag-and-drop) and
  // loads it into the active chat's session.
  handleAgentFile: (file: File) => Promise<void>

  // The single place that tears a chat's session down and brings it back
  // to a blank slate, syncing the view immediately if that chat is the one
  // currently on screen. Used both when starting a new chat and when
  // swapping a different agent into the unsaved "__new__" bucket.
  resetSession: (chatKey: string) => void

  // Whether the given chat already has an agent loaded (used to decide
  // whether opening a new .agent file should prompt the user or just load).
  hasActiveAgent: (chatKey: string) => boolean

  // Queues a payload to be loaded onto whatever chat id shows up next
  // (used when the user is asked to start a fresh chat for a new agent).
  queueNewChatPayload: (payload: UnpackPayload) => void
}

const defaultAgentSessionContext: AgentSessionContextType = {
  engine: null,
  currentState: "",
  graphData: null,
  visitedOrder: [],
  parseError: null,
  behaviorText: "",
  descriptionText: "",
  agentMeta: null,
  agentLoading: false,
  behaviors: [],
  setParseError: () => {},
  loadAgentBundle: async () => {},
  handleAgentFile: async () => {},
  resetSession: () => {},
  hasActiveAgent: () => false,
  queueNewChatPayload: () => {}
}

export const AgentSessionContext = createContext<AgentSessionContextType>(
  defaultAgentSessionContext
)
