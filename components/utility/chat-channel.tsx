"use client"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { ChatbotUIContext } from "@/context/context"
import {
  ChannelController,
  ChannelEngine
} from "@/lib/channels/channel-controller"
import {
  registerController,
  unregisterController
} from "@/lib/channels/registry"
import { getMessagesByChatId } from "@/db/messages"
import { LLM_LIST } from "@/lib/models/llm/llm-list"
import { logger } from "@/lib/logger"
import { useChannelStore, isChannelBusy } from "@/lib/store/channel-store"
import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls
} from "ai"
import { FC, useContext, useEffect, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"

interface ChatChannelProps {
  threadId: string
}

const NOOP_ENGINE: ChannelEngine = {
  append: () => {},
  stop: () => {},
  setMessages: () => {},
  addToolOutput: () => {}
}

// ONE chat channel — the thin shell around this thread's own useChat() instance.
// Renders nothing: it is pure runtime. See ADR-0007.
//
// Every channel is an independent stream. Several are mounted at once (the one on
// screen, plus any still generating in the background), and they cannot corrupt
// each other: each has its own useChat store, its own ChannelController and its own
// agent session.
//
// This component deliberately holds NO domain logic. Its whole job is to hand the
// SDK's callbacks to the controller and keep the controller's deps fresh. That is
// what makes useChat a swappable ENGINE rather than the owner of the chat — moving
// to a vanilla `Chat` in a worker (plan 003) would replace this file and nothing
// else.
export const ChatChannel: FC<ChatChannelProps> = ({ threadId }) => {
  const context = useContext(ChatbotUIContext)
  const { i18n } = useTranslation()

  const viewedThreadId = useChannelStore(s => s.viewedThreadId)
  const channelState = useChannelStore(s => s.channels[threadId])
  const isViewed = viewedThreadId === threadId
  const isBusy = isChannelBusy(channelState)

  // Remote providers are discovered live (lib/models/fetch-models.ts) rather than
  // listed in the static LLM_LIST, so routing must also check the live-discovered
  // sets — otherwise a live model falls through to "custom" and misroutes.
  // availableLocalModels is intentionally NOT included: local models are meant to
  // fall through to "custom" and be resolved by resolveCustomModel.
  const builtInModel = [
    ...LLM_LIST,
    ...context.availableHostedModels,
    ...context.availableOpenRouterModels
  ].find(m => m.modelId === context.chatSettings?.model)
  const currentProvider = builtInModel?.provider || "custom"

  const controller = useMemo(() => new ChannelController(threadId), [threadId])
  const engineRef = useRef<ChannelEngine>(NOOP_ENGINE)

  // Read through a ref inside the controller's callbacks, so a channel that stops
  // being viewed mid-stream immediately stops writing the legacy mirror.
  const isViewedRef = useRef(isViewed)
  isViewedRef.current = isViewed

  // MCP tools are fetched once and cached, so a send never blocks on a network
  // round trip before the user's own message can appear.
  const mcpToolsRef = useRef<any[]>([])
  useEffect(() => {
    let cancelled = false
    fetch("/api/mcp/tools")
      .then(r => (r.ok ? r.json() : []))
      .then(d => {
        if (!cancelled) mcpToolsRef.current = Array.isArray(d) ? d : []
      })
      .catch(err =>
        logger.warn("MCP tools prefetch failed", { error: err?.message })
      )
    return () => {
      cancelled = true
    }
  }, [])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/chat/${currentProvider}`,
        prepareSendMessagesRequest: ({ messages, id, body }) =>
          controller.buildRequestBody({ messages, id, body })
      }),
    [currentProvider, controller]
  )

  const {
    messages: vercelMessages,
    sendMessage: append,
    stop,
    status,
    setMessages,
    addToolOutput
  } = useChat({
    transport,
    id: threadId,
    // Without this, the SDK's React store deep-clones and re-notifies on EVERY
    // streamed chunk; a burst of chunks (tool-call args streamed token by token)
    // can trip React's "Maximum update depth exceeded" guard.
    experimental_throttle: 50,
    onData: part => controller.onData(part),
    sendAutomaticallyWhen: ({ messages }) => {
      if (!lastAssistantMessageIsCompleteWithToolCalls({ messages }))
        return false
      return controller.shouldAutoResubmit(messages as any[])
    },
    onToolCall: ({ toolCall }) => controller.onToolCall(toolCall),
    onFinish: ({ message }: { message: any }) => controller.onFinish(message),
    onError: error => controller.onError(error)
  })

  // The engine's imperative surface, handed to the controller fresh every render.
  engineRef.current = {
    append: (m: { text: string }) => append(m),
    stop,
    setMessages,
    addToolOutput: (out: any) => (addToolOutput as any)(out)
  }

  // Refreshed on EVERY render (not just at send time) so the SDK's automatic
  // tool-result resubmit — which reuses the transport with no per-call body — still
  // sees current config. Without this the resubmit POSTs an empty body and the
  // route throws "base_url required".
  controller.setApiPath(`/api/chat/${currentProvider}`)
  controller.refresh(
    {
      chatSettings: context.chatSettings,
      profile: context.profile,
      models: context.models,
      availableLocalModels: context.availableLocalModels,
      backgroundModel: context.backgroundModel,
      builtInModel,
      language: i18n.language,
      mcpTools: mcpToolsRef.current,
      selectedWorkspaceId: context.selectedWorkspace?.id,
      selectedChat: context.selectedChat,

      // THE fix (ADR-0007): the session is looked up by THIS channel's own
      // agentSessionId, so a request always carries the agent that actually owns
      // the conversation — never whichever agent happens to be on screen. Reading
      // the global flowState/persona here is what made a message sent in chat B
      // travel with chat A's FSM and come back classified as "offtopic".
      getAgentSession: id => context.chatAgentSessionsRef.current.get(id),
      updateAgentSession: (id, patch) =>
        context.updateChatAgentSession(id, patch),

      isViewed: () => isViewedRef.current,

      mirror: {
        setChatMessages: context.setChatMessages,
        setThinkingLog: context.setThinkingLog,
        setFirstTokenReceived: context.setFirstTokenReceived,
        setFlowState: context.setFlowState,
        setKnowledge: context.setKnowledge
      },

      setSelectedChat: context.setSelectedChat,
      setChats: context.setChats,
      setUserInput: context.setUserInput
    },
    engineRef.current
  )

  useEffect(() => {
    registerController(threadId, controller)
    return () => {
      unregisterController(threadId)
      controller.dispose()
    }
  }, [threadId, controller])

  // Mirror the SDK's own status into the store — this is what keeps a background
  // channel mounted (the host's live set reads it) and what lets the sidebar badge
  // a chat that is still generating off-screen.
  useEffect(() => {
    controller.setStatus(status as any)
  }, [status, controller])

  // Seed this thread's persisted history into the engine, exactly once. Only the
  // viewed channel ever needs seeding: a channel exists because it is on screen, or
  // because it is finishing a stream it began while on screen (in which case its
  // engine already holds the conversation).
  useEffect(() => {
    if (controller.hasSeeded) return
    if (!isViewed || isBusy) return

    // A brand-new, unsent thread has no rows yet — seed empty, skip the DB.
    if (!context.selectedChat || context.selectedChat.id !== threadId) {
      controller.seed([])
      return
    }

    // chat-ui loads the chat's rows into the legacy mirror BEFORE it sets
    // selectedChat (which is what makes this thread the viewed one), so they are
    // already here — reuse them instead of hitting IndexedDB twice. Fall back to a
    // read if the mirror is somehow empty for a chat that does have history.
    if (context.chatMessages.length > 0) {
      controller.seed(context.chatMessages)
      return
    }
    let cancelled = false
    getMessagesByChatId(threadId).then(rows => {
      if (cancelled || controller.hasSeeded) return
      controller.seed(rows.map(message => ({ message, fileItems: [] })))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    threadId,
    isViewed,
    isBusy,
    context.selectedChat?.id,
    context.chatMessages
  ])

  // The one-way projection: SDK messages -> DB-shaped rows. Runs for background
  // channels too (each keeps its own list current, which is what its sequence
  // numbers are computed from), but only the viewed one writes the mirror the UI
  // reads — see ChannelController.project.
  useEffect(() => {
    controller.project(vercelMessages as any[])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vercelMessages])

  // Coming back to a chat that kept generating while we were away: replay this
  // channel's current state into the mirror so the screen catches up at once
  // instead of waiting for the next streamed chunk.
  useEffect(() => {
    if (isViewed) controller.syncMirror()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isViewed])

  // The viewed channel's busy state DERIVES the legacy isGenerating flag.
  // Derived, not edge-triggered: the old code cleared isGenerating only on the
  // streaming->idle transition AND only while the chat was on screen, so leaving a
  // chat mid-stream and coming back after it finished left isGenerating stuck true
  // — the send button frozen as "Stop". A derived mirror cannot get stuck.
  useEffect(() => {
    if (!isViewed) return
    context.setIsGenerating(isBusy)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isViewed, isBusy])

  useEffect(() => {
    if (!isViewed) return
    context.setFirstTokenReceived(!!channelState?.firstTokenReceived)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isViewed, channelState?.firstTokenReceived])

  return null
}
