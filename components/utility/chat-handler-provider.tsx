"use client"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { ChannelHost } from "@/components/utility/channel-host"
import { ChatHandlerContext } from "@/context/chat-handler-context"
import { ChatbotUIContext } from "@/context/context"
import { getController } from "@/lib/channels/registry"
import { useChannelStore } from "@/lib/store/channel-store"
import { logger } from "@/lib/logger"
import { ChatMessage } from "@/types"
import { useRouter } from "next/navigation"
import { FC, useContext, useEffect, useRef, useState } from "react"

interface ChatHandlerProviderProps {
  children: React.ReactNode
}

// The chat FACADE — and nothing else. See ADR-0007.
//
// This used to be a 780-line God-component that owned the app's single useChat()
// instance, and with it: the transport, the tool loop, the FSM advance, persistence,
// the projection and the request body. All of that now lives in a per-thread
// ChannelController (plain TS, no React), driven by a <ChatChannel> per live thread.
//
// What is left here is exactly three jobs:
//   1. Decide which thread is VIEWED and publish it to the channel store.
//   2. Own the new-chat lifecycle (mint the next thread id, clear the mirror).
//   3. Expose useChatHandler()'s 6-member API, delegating send/stop to the VIEWED
//      thread's controller — so all ~10 consumers of the hook keep working unchanged.
export const ChatHandlerProvider: FC<ChatHandlerProviderProps> = ({
  children
}) => {
  const router = useRouter()
  const context = useContext(ChatbotUIContext)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const setViewedThreadId = useChannelStore(s => s.setViewedThreadId)

  // A brand-new (not yet sent) chat is a thread like any other: it is born with its
  // FINAL id, minted here. The first send simply creates the DB row UNDER that id.
  //
  // This is what retired the old "__new__" bucket and its migrateChatAgentSession
  // step: the id never changes, so there is nothing to migrate — and the migration
  // is precisely where "novo chat inherits the previous chat's agent" came from
  // (ADR-0002). A thread's id is immutable from birth.
  const [pendingThreadId, setPendingThreadId] = useState<string>(() =>
    crypto.randomUUID()
  )

  // The thread on screen: a real chat once one is open, otherwise the unsent one.
  const viewedThreadId = context.selectedChat?.id ?? pendingThreadId

  // Publishing it to the store is the only handoff needed: AgentSessionProvider
  // subscribes to the same value and keys its agent sessions by it, so both sides
  // agree on "which thread is active" with no second source of truth.
  useEffect(() => {
    setViewedThreadId(viewedThreadId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedThreadId])

  const handleNewChat = async () => {
    if (!context.selectedWorkspace) return

    // The chat being left is NOT aborted: if it is still generating, its channel
    // stays mounted (the host's live set keeps it) and its reply lands in it. The
    // sidebar badges it as generating so the user can see it is still working.
    // (Before channels this called stop(), because a single shared useChat meant the
    // old stream's tokens would otherwise land in the new chat's store.)

    // An unsent thread the user is walking away from will never exist: drop its
    // agent session so its KernelProxy/worker is not leaked.
    if (!context.selectedChat) {
      context.destroyChatAgentSession(pendingThreadId)
    }

    setPendingThreadId(crypto.randomUUID())

    context.setSelectedAssistant(null)
    context.setUserInput("")
    context.setChatMessages([])
    context.setSelectedChat(null)
    context.setIsGenerating(false)
    context.setFirstTokenReceived(false)
    context.setKnowledge([])
    router.push(`/${context.selectedWorkspace.id}/chat`)
  }

  const handleFocusChatInput = () => {
    chatInputRef.current?.focus()
  }

  // Send/stop always target the thread on screen. A background channel is never
  // driven from the UI — it is finishing a turn the user already started.
  const handleSendMessage = async (
    messageContent: string,
    _chatMessages: ChatMessage[],
    _isRegeneration: boolean
  ) => {
    const controller = getController(viewedThreadId)
    if (!controller) {
      logger.error("no channel for the viewed thread", { viewedThreadId })
      return
    }
    await controller.send(messageContent)
  }

  const handleStopMessage = () => {
    getController(viewedThreadId)?.stop()
  }

  const handleSendEdit = async () => {}

  return (
    <ChatHandlerContext.Provider
      value={{
        handleNewChat,
        handleSendMessage,
        handleFocusChatInput,
        handleStopMessage,
        handleSendEdit,
        chatInputRef
      }}
    >
      {/* The live channels. Rendered here — inside the root layout, above the route
          — so they survive navigation between chats and keep streaming. */}
      <ChannelHost />
      {children}
    </ChatHandlerContext.Provider>
  )
}
