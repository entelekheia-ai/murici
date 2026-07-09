/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { ChatMessage } from "@/types"
import { RefObject, createContext } from "react"

// Owns the single Vercel AI SDK useChat() instance for the whole app. Lifted
// into its own Provider (mounted once near the app root, alongside
// GlobalState and AgentSessionProvider) because useChatHandler() used to be
// called directly in 9 different components — each call created its own
// independent useChat() instance, and the AI SDK synchronizes messages/status
// across instances sharing an id but still fires each instance's own
// onFinish/onError for the same completion event, producing duplicate/
// corrupted message writes. A single owner + context consumer fixes this the
// same way AgentSessionProvider fixed the equivalent problem for RightSidebar.
export interface ChatHandlerContextType {
  handleNewChat: () => Promise<void>
  handleSendMessage: (
    messageContent: string,
    chatMessages: ChatMessage[],
    isRegeneration: boolean
  ) => Promise<void>
  handleFocusChatInput: () => void
  handleStopMessage: () => void
  handleSendEdit: () => Promise<void>
  chatInputRef: RefObject<HTMLTextAreaElement>
}

const defaultChatHandlerContext: ChatHandlerContextType = {
  handleNewChat: async () => {},
  handleSendMessage: async () => {},
  handleFocusChatInput: () => {},
  handleStopMessage: () => {},
  handleSendEdit: async () => {},
  chatInputRef: { current: null }
}

export const ChatHandlerContext = createContext<ChatHandlerContextType>(
  defaultChatHandlerContext
)
