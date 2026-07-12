"use client"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { ChatHandlerContext } from "@/context/chat-handler-context"
import { ChatbotUIContext } from "@/context/context"
import { updateChat, createChat } from "@/db/chats"
import { createMessages } from "@/db/messages"
import { ChatMessage, FlowEventType } from "@/types"
import { Message } from "@/types/database"
import { useRouter } from "next/navigation"
import { FC, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls
} from "ai"
import { executeClientTool } from "@/lib/tools/orchestrator"
import { normalizeToolCall } from "@/lib/tools/normalize-tool-call"
import { runTriggerIntent } from "@/lib/tools/executors/trigger-intent"
import { buildFlowStateFromEffects } from "@/lib/runtime/advance-flow"
import { buildBehaviorStatePayload } from "@/lib/runtime/dot-agent-injector"
import { LLM_LIST } from "@/lib/models/llm/llm-list"
import { getMessageText, getToolInvocations, getReasoningText, dedupeToolCallParts } from "@/lib/ai/ui-message-parts"
import { resolveCustomModel } from "@/lib/models/resolve-custom-model"
import { buildApiKeys } from "@/lib/models/build-api-keys"
import { parseStreamError, StreamErrorDetails } from "@/lib/errors/api-error"
import { translateErrorMessage } from "@/lib/errors/auto-translate"
import { logger } from "@/lib/logger"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"

interface ChatHandlerProviderProps {
  children: React.ReactNode
}

// Single owner of the app's one useChat() instance and its lifecycle.
//
// The AI SDK's useChat().messages is the ONE source of truth for message
// content. This provider does exactly two things with it and never mirrors
// state back into it token-by-token:
//   - loads persisted history into it once when a chat is opened (seed effect)
//   - projects it one-way into ChatbotUIContext.chatMessages so the ~10 existing
//     consumers (chat-messages, message, chat-input history, build-prompt, ...)
//     keep reading the DB-shaped list they already expect, without any of them
//     importing @ai-sdk/react.
//
// That one-directional flow (SDK -> chatMessages, DB only on open/finish) is
// what removed the earlier bidirectional-mirroring bugs: reasoning vanishing at
// stream end, the intermittent stuck-loading spinner, and the mid-stream id
// swap. See project/adr/0003 + its log for the full history.
export const ChatHandlerProvider: FC<ChatHandlerProviderProps> = ({
  children
}) => {
  const router = useRouter()
  const context = useContext(ChatbotUIContext)
  const { i18n } = useTranslation()
  // Remote providers (openai/anthropic/google/mistral/groq) are now
  // discovered live (see lib/models/fetch-models.ts) rather than listed in
  // the static LLM_LIST, so routing must also check the live-discovered set
  // in context — otherwise a live model would fall through to "custom" and
  // misroute to app/api/chat/custom. OpenRouter models are discovered live
  // too (context.availableOpenRouterModels) and were missing here — that's
  // what caused "Custom model base_url is required" for openrouter models.
  // availableLocalModels is intentionally NOT included: local models are
  // meant to fall through to "custom" and get resolved via
  // resolveCustomModel's local-models bucket.
  const builtInModel = [
    ...LLM_LIST,
    ...context.availableHostedModels,
    ...context.availableOpenRouterModels
  ].find(m => m.modelId === context.chatSettings?.model)
  const currentProvider = builtInModel?.provider || "custom"
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const chatMessagesRef = useRef(context.chatMessages)

  // Now that useChat() is mounted exactly once (not once per consuming
  // component), a per-instance ref is enough to guard re-entrancy.
  const isSendingRef = useRef(false)

  // Hard cap on automatic tool-result resubmits within a single user turn. A
  // misbehaving local model can keep firing trigger_intent every step (never
  // producing a text answer) and, since some servers reuse tool_call ids, that
  // runs away and corrupts the history. Enforced idempotently from the message
  // list in sendAutomaticallyWhen below; the v5 answer to v4's maxSteps: 5.
  const MAX_AUTO_STEPS = 6

  // One-shot guard so a tool turn is resubmitted EXACTLY once. The SDK triggers
  // the automatic resubmit from two independent places (ai/dist index.js):
  //   - end of makeRequest (16714): after the stream finishes.
  //   - inside addToolOutput (16505): when the tool output lands.
  // Both only guard on `status`, and our addToolOutput is necessarily
  // fire-and-forget (it enqueues on the same SerialJobExecutor that is already
  // running onToolCall, so awaiting it would deadlock). If that deferred output
  // lands in the microtask window between setStatus("ready") and the resubmit
  // flipping status to "submitted", BOTH fire -> the same tool turn is POSTed
  // twice, and a local model that reuses call_ ids re-emits the tool call ->
  // the duplicated call_… in the history. Keyed on the tool-bearing assistant
  // message id, so whichever trigger wins resubmits and the other is a no-op.
  // This is identity dedupe (idempotent), not the monotonic counter that used
  // to over-count. Cleared per new chat.
  const resubmittedTurnsRef = useRef<Set<string>>(new Set())

  // The useChat id is allocated on the client and stays stable for the life of
  // a chat: for an existing chat it's the DB id (adopted below on navigation),
  // for a brand-new chat it's a uuid we generate up front and then reuse as the
  // DB chat id on first send. It is never reassigned mid-stream, so the SDK's
  // per-id message store is never swapped out from under an in-flight response
  // — that swap was the cause of the "sometimes only the loading spinner
  // stays" symptom.
  const [activeChatId, setActiveChatId] = useState<string>(
    () => context.selectedChat?.id ?? crypto.randomUUID()
  )
  const pendingNewChatIdRef = useRef<string>(activeChatId)

  // MCP tools are fetched once up front and cached, so a send never blocks on a
  // network round trip before the user's own message can appear — that fetch
  // sitting on the critical path was the "long delay after Enter" symptom.
  const mcpToolsRef = useRef<any[]>([])

  useEffect(() => {
    chatMessagesRef.current = context.chatMessages
    logger.trace("chatMessages changed", {
      count: context.chatMessages.length,
      lastRole: context.chatMessages[context.chatMessages.length - 1]?.message.role,
      lastLen: context.chatMessages[context.chatMessages.length - 1]?.message.content?.length ?? -1
    })
  }, [context.chatMessages])

  useEffect(() => {
    let cancelled = false
    fetch("/api/mcp/tools")
      .then(r => (r.ok ? r.json() : []))
      .then(d => {
        if (!cancelled) mcpToolsRef.current = Array.isArray(d) ? d : []
      })
      .catch(err => logger.warn("MCP tools prefetch failed", { error: err?.message }))
    return () => {
      cancelled = true
    }
  }, [])

  // Everything the chat route needs beyond the messages themselves. Kept in a
  // ref refreshed every render (not just at send time) so the SDK's automatic
  // tool-result resubmission — which reuses the transport with no per-call body
  // — still carries customModel/behaviorState/etc. Without it the resubmit POSTs
  // an empty body and the route throws "base_url required".
  const requestCtxRef = useRef<Record<string, any>>({})
  requestCtxRef.current = {
    chatSettings: context.chatSettings,
    customModel: resolveCustomModel(
      context.models,
      context.availableLocalModels,
      context.chatSettings?.model
    ),
    apiKeys: buildApiKeys(context.profile),
    behaviorState: context.flowState || undefined,
    agentPersona: context.agentPersona || undefined,
    mcpTools: mcpToolsRef.current
  }

  // Real-time debug mirror: each actual exchange step is pushed as a flowEvent
  // that the chat renders inline, in order (components/messages/flow-event-card
  // + chat-messages). Held in a ref so the memoized transport's closure below
  // always calls the current one.
  const pushDebugRef = useRef<(type: FlowEventType, data: any) => string>(
    () => ""
  )
  pushDebugRef.current = (type, data) => {
    const id = crypto.randomUUID()
    context.addFlowEvent({
      id,
      seqNum: chatMessagesRef.current.length,
      type,
      timestamp: Date.now(),
      data
    })
    return id
  }

  // Shared by every "error" flowEvent producer (useChat's onError below, and
  // trigger_intent's catch further down) so the debug bubble, the toast, and
  // the fire-and-forget translation can't drift into two versions. Translation
  // never blocks or throws: on failure the bubble just keeps showing the
  // original text (decided default, no extra toast).
  const reportError = (details: StreamErrorDetails | { message: string }) => {
    const id = pushDebugRef.current("error", details)
    toast.error(`Failed to get a response: ${details.message}`)
    const translateModel = context.backgroundModel ?? builtInModel
    if (translateModel) {
      translateErrorMessage(details.message, translateModel, i18n.language).then(
        translatedMessage => {
          if (translatedMessage) {
            context.updateFlowEvent(id, { translatedMessage })
          }
        }
      )
    }
  }

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/chat/${currentProvider}`,
        // We own the whole outgoing body here so every request — first send AND
        // the automatic tool-result resubmit — carries the route's inputs.
        prepareSendMessagesRequest: ({ messages, id, body }) => {
          // Strip any phantom duplicate tool-call parts the SDK's resubmit left in
          // the store (see dedupeToolCallParts) so the model never receives the
          // same toolCallId twice — that duplicate is what cascades into re-reasoning
          // / MissingToolResults. Purely on the outgoing wire; the SDK store is
          // untouched.
          const dedupedMessages = dedupeToolCallParts(messages as any)
          const finalBody = {
            ...body,
            ...requestCtxRef.current,
            messages: dedupedMessages,
            id
          }
          // Mirror the exact client -> route POST (one per send AND per
          // auto-resubmit). Redact api_key/apiKeys; keep everything else verbatim.
          const { customModel, apiKeys, ...restBody } = finalBody as any
          pushDebugRef.current("client_request", {
            api: `/api/chat/${currentProvider}`,
            messageCount: messages.length,
            body: {
              ...restBody,
              customModel: customModel
                ? { ...customModel, api_key: undefined }
                : undefined,
              apiKeys: apiKeys ? { redacted: true } : undefined
            }
          })
          return { body: finalBody }
        }
      }),
    [currentProvider]
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
    id: activeChatId,
    // The route emits a transient data-debug part with the exact system + final
    // model messages it sent this request; mirror it inline as a server_prompt
    // event (the "what really went to the model" half of the debug view).
    onData(part: any) {
      if (part?.type === "data-debug") {
        pushDebugRef.current("server_prompt", part.data)
      }
    },
    // When the assistant turn ends with client-executed tool calls (our tools
    // all run in onToolCall below, never server-side), resubmit automatically so
    // the tool results go back to the model for its follow-up answer. Without
    // this the turn stalls with an unanswered tool call, and the next user turn
    // dies server-side with AI_MissingToolResultsError. This is the v5
    // replacement for v4's useChat({ maxSteps }).
    sendAutomaticallyWhen: ({ messages }) => {
      if (!lastAssistantMessageIsCompleteWithToolCalls({ messages })) return false
      // The SDK calls this more than once per step — from addToolOutput AND from
      // the stream-finish handler (ai/dist AbstractChat 16505 + 16714), both only
      // guarded on `status`, with a race window between them. So this must NOT
      // carry cumulative side effects (a mutating ++ counter over-counts). Two
      // idempotent guards instead:
      //   1. Runaway cap: count tool calls since the last user turn from the
      //      messages themselves and stop once the loop runs away.
      const lastUserIdx = messages.map((m: any) => m.role).lastIndexOf("user")
      const toolCallsThisTurn = messages
        .slice(lastUserIdx + 1)
        .reduce(
          (n: number, m: any) =>
            n +
            (m.parts || []).filter(
              (p: any) =>
                p?.type === "dynamic-tool" ||
                (typeof p?.type === "string" && p.type.startsWith("tool-"))
            ).length,
          0
        )
      if (toolCallsThisTurn >= MAX_AUTO_STEPS) return false
      //   2. One-shot per tool-bearing assistant message: dedupe the two triggers
      //      by identity so a turn resubmits exactly once (see resubmittedTurnsRef).
      //      Adding an already-present id is a no-op — safe under repeat calls.
      const turnKey = (messages[messages.length - 1] as any)?.id
      if (turnKey) {
        if (resubmittedTurnsRef.current.has(turnKey)) return false
        resubmittedTurnsRef.current.add(turnKey)
      }
      return true
    },
    async onToolCall({ toolCall }) {
      // Only a chat to attach the result to is required. Gating on flowState too
      // (as before) wrongly blocked MCP and save_doc tools, which are
      // independent of the FSM agent — the FSM-only tools (trigger_intent,
      // state_graph) simply aren't registered when there's no behaviorState.
      if (!context.selectedChat) return

      const tc = toolCall as unknown as {
        toolCallId: string
        toolName: string
        input: any
      }

      // Duplication probe (see project/adr/0004 log §11): logs EVERY onToolCall
      // invocation with the id + the kernel-vs-React state at that instant. If the
      // same toolCallId logs here N times, the model/SDK is really re-calling; if
      // it logs once but shows up N× in the history, the copies are phantom (store
      // duplication). kernelState vs reactFlowState catches the case where a
      // resubmit re-offers the OLD intents because setFlowState hasn't propagated.
      logger.debug("onToolCall invoked", {
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        intentName: tc.input?.intent_name,
        kernelState: context.flowEngine?.get_current_state?.(),
        kernelValidIntents: context.flowEngine?.get_valid_intents?.(),
        reactFlowState: context.flowState?.currentState
      })

      // Mirror the tool call the model just made.
      pushDebugRef.current("tool_call", {
        toolName: tc.toolName,
        intentName: tc.input?.intent_name,
        args: tc.input
      })

      // The SDK DISCARDS onToolCall's return value (ai/dist: `await
      // onToolCall({ toolCall })`, result unused). A client-side tool output has
      // to be recorded with addToolOutput, which also flips the tool part to
      // output-available so sendAutomaticallyWhen resubmits the result to the
      // model. Returning a value here left the call unanswered ->
      // MissingToolResultsError on the next turn. Tools aren't declared on the
      // client useChat, so the typed name is cast away.
      const report = (output: any) =>
        (addToolOutput as any)({
          tool: tc.toolName,
          toolCallId: tc.toolCallId,
          output
        })

      // trigger_intent is the FSM's transition signal. Advance the kernel here,
      // awaited, then report the new state as the tool output so it travels to
      // the model in the resubmit. No behaviorState side-channel, no race
      // between the advance and the resubmit. flowState is updated only as a
      // derived view for the right-sidebar panel; the kernel stays the single
      // source of truth.
      if (tc.toolName === "trigger_intent" && context.flowEngine) {
        const intentName = tc.input?.intent_name
        // Keep the debug-panel event bridge (murici:tool_call) firing.
        runTriggerIntent(tc.input, tc)
        if (!intentName) {
          report({ error: "trigger_intent called without intent_name" })
          return
        }
        // Reject an intent that isn't valid in the CURRENT state rather than
        // advancing the FSM somewhere wrong. A model that ignores the freshly
        // transitioned state — or a duplicated/stale tool call from a server
        // that reuses tool_call ids — keeps re-firing the PREVIOUS intent, which
        // is no longer in allowed_intents here. Feed that back to the model
        // instead of corrupting the flow (the "intent foi pro lugar errado" bug).
        const validIntents: string[] =
          context.flowEngine.get_valid_intents?.() || []
        if (validIntents.length > 0 && !validIntents.includes(intentName)) {
          logger.warn("trigger_intent rejected: not allowed in current state", {
            intentName,
            validIntents
          })
          // A rejected re-fire is almost always the model repeating the intent it
          // ALREADY triggered (ignoring the advanced state). Don't just say "not
          // allowed" — tell it the transition happened and to stop calling tools
          // and produce the answer, so it recovers on the next resubmit instead of
          // looping the same call (which is what stacked the duplicated call_ ids).
          const cur = context.flowState
          report({
            error: `Intent "${intentName}" is not valid now. The flow already advanced to state "${cur?.currentState}". Do NOT call trigger_intent again for this — reply to the user with text to fulfill the current goal.`,
            current_state: cur?.currentState,
            goal: cur?.goal,
            allowed_intents: validIntents
          })
          return
        }
        try {
          const from = context.flowEngine.get_current_state()
          const effects = await context.flowEngine.send_intent(intentName)
          const advanced = buildFlowStateFromEffects(
            context.flowEngine,
            effects,
            context.agentKnowledgeFiles
          )
          context.setFlowState(advanced)
          const payload = buildBehaviorStatePayload(advanced)
          pushDebugRef.current("fsm_transition", {
            from,
            to: advanced.currentState,
            newGoal: advanced.goal,
            newGuide: advanced.guide,
            effects
          })
          pushDebugRef.current("tool_result", {
            toolName: "trigger_intent",
            output: payload
          })
          report(payload)
        } catch (err: any) {
          logger.error("trigger_intent advance failed", { error: err.message })
          reportError({ message: err.message || "Failed to advance the flow" })
          report({ error: err.message || "Failed to advance the flow" })
        }
        return
      }

      // Everything else (MCP, save_doc, state_graph) runs through the
      // orchestrator. v5 tool calls carry arguments on `input`; normalizeToolCall
      // maps that to the orchestrator's `args` (reading .args directly was
      // undefined, the bug that crashed executors mid-body).
      const result = await executeClientTool(normalizeToolCall(tc), {
        chatId: context.selectedChat?.id || activeChatId,
        messageId: tc.toolCallId,
        promptMessageId: "",
        behaviorState: context.flowState || undefined
      })
      pushDebugRef.current("tool_result", { toolName: tc.toolName, output: result })
      report(result)
    },
    // The AI SDK calls this with { message, messages, isAbort, ... } — NOT the
    // message itself (ChatOnFinishCallback in ai/dist/index.d.ts). We only
    // persist here; the projection effect already put the streamed reply on
    // screen, so this does NOT touch chatMessages (doing so is what used to
    // overwrite the visible reply with an empty row).
    async onFinish({ message }: { message: any }) {
      logger.debug("useChat onFinish fired", {
        hasSelectedChat: !!context.selectedChat,
        role: message?.role,
        textLen: getMessageText(message).length
      })
      // Mirror the assistant message the model produced (the "recebeu" half).
      pushDebugRef.current("llm_response", {
        role: message?.role,
        text: getMessageText(message),
        parts: message?.parts
      })
      if (!context.selectedChat) return

      // Persist under the SDK message's own id so the row the projection is
      // already showing (and its id-keyed reasoning in thinkingLog) stays
      // stable across the streaming -> persisted handoff.
      const projected = chatMessagesRef.current.find(
        c => c.message.id === message.id
      )
      const seqNum =
        projected?.message.sequence_number ??
        (chatMessagesRef.current.length > 0
          ? chatMessagesRef.current[chatMessagesRef.current.length - 1].message
              .sequence_number + 1
          : 1)

      await createMessages([
        {
          id: message.id,
          chat_id: context.selectedChat.id,
          content: getMessageText(message),
          role: message.role as "user" | "assistant" | "system" | "tool",
          model: context.chatSettings?.model || "custom",
          user_id: context.profile!.id,
          sequence_number: seqNum
        }
      ])

      await updateChat(context.selectedChat.id, {
        updated_at: new Date().toISOString()
      })
    },
    onError(error) {
      // error.stack included so a React-internal failure surfacing through
      // this callback (e.g. "Maximum update depth exceeded") carries its
      // component stack instead of just a bare message — otherwise there's
      // no way to tell which component's setState call caused it.
      logger.error("Vercel AI SDK onError", {
        error: error.message,
        stack: error.stack
      })
      reportError(parseStreamError(error.message))
      context.setIsGenerating(false)
      context.setFirstTokenReceived(false)
    }
  })

  const isStreaming = status === "streaming" || status === "submitted"

  // Navigation: adopt an opened chat's DB id as the useChat id, but never while
  // streaming (that would abort the in-flight response). New chats keep their
  // client-generated uuid — handleSendMessage persists the chat row under that
  // same id, so selectedChat.id === activeChatId and this stays a no-op during
  // a send.
  useEffect(() => {
    if (isStreaming) return
    const dbId = context.selectedChat?.id
    if (dbId && dbId !== activeChatId) setActiveChatId(dbId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.selectedChat?.id, status])

  // Seed useChat with persisted history exactly once per chat id (chat-ui loads
  // the DB rows into context.chatMessages when a chat is opened). The ref guard
  // keeps the projection's own writes from ever re-seeding.
  const seededIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (isStreaming) return
    if (seededIdRef.current === activeChatId) return
    seededIdRef.current = activeChatId
    setMessages(
      context.chatMessages.map(cm => ({
        id: cm.message.id,
        role: cm.message.role as "user" | "assistant" | "system",
        parts: [{ type: "text", text: cm.message.content }]
      })) as any
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId, status, context.chatMessages])

  // The single one-way projection: SDK messages -> DB-shaped chatMessages.
  // Existing rows are merged by id so created_at / sequence_number stay stable
  // (no timestamp churn, no key thrash) while new/streaming rows are filled in.
  useEffect(() => {
    if (vercelMessages.length === 0) return

    // Duplication probe: log the SDK's own message ids and tool-call ids on every
    // projection. If a message id or toolCallId repeats here, the duplication is
    // in our/the SDK's message store (a double resubmit / reseed) — not the model
    // re-calling. If ids are unique but content repeats, it's the model.
    const toolCallIds = vercelMessages.flatMap((m: any) =>
      (m.parts || [])
        .filter(
          (p: any) =>
            p?.type === "dynamic-tool" ||
            (typeof p?.type === "string" && p.type.startsWith("tool-"))
        )
        .map((p: any) => p.toolCallId)
    )
    logger.trace("projection: SDK message snapshot", {
      count: vercelMessages.length,
      ids: vercelMessages.map((m: any) => m.id),
      dupMessageIds:
        vercelMessages.length !==
        new Set(vercelMessages.map((m: any) => m.id)).size,
      toolCallIds,
      dupToolCallIds: toolCallIds.length !== new Set(toolCallIds).size
    })

    // Collapse the SDK-store phantom tool-call copies (the dup the probe above
    // reports) BEFORE projecting, so the UI and the persisted rows show each tool
    // call once. Probe stays on the raw list so we can still see the SDK-level dup.
    const sdkMessages = dedupeToolCallParts(vercelMessages as any)

    const prevById = new Map(
      chatMessagesRef.current.map(cm => [cm.message.id, cm])
    )
    const nextThinking: Record<string, string> = {}

    const projected: ChatMessage[] = sdkMessages.map((m, i) => {
      const prev = prevById.get(m.id)
      const content = getMessageText(m)
      const tools = getToolInvocations(m)
      const reasoning = getReasoningText(m)
      if (reasoning) nextThinking[m.id] = reasoning

      const message: Message = {
        id: m.id,
        chat_id: context.selectedChat?.id ?? activeChatId,
        user_id: prev?.message.user_id ?? "local",
        assistant_id: prev?.message.assistant_id ?? null,
        role: m.role as Message["role"],
        content,
        model: prev?.message.model ?? context.chatSettings?.model ?? "custom",
        sequence_number: prev?.message.sequence_number ?? i + 1,
        tool_calls: tools,
        tool_call_id: prev?.message.tool_call_id,
        image_paths: prev?.message.image_paths ?? [],
        created_at: prev?.message.created_at ?? new Date().toISOString(),
        updated_at: prev?.message.updated_at ?? null
      }
      return { message, fileItems: prev?.fileItems ?? [] }
    })

    context.setChatMessages(projected)

    if (Object.keys(nextThinking).length > 0) {
      context.setThinkingLog(prev => ({ ...prev, ...nextThinking }))
    }

    const last = sdkMessages[sdkMessages.length - 1]
    if (
      !context.firstTokenReceived &&
      last?.role === "assistant" &&
      (getMessageText(last).length > 0 ||
        getToolInvocations(last).length > 0 ||
        getReasoningText(last).length > 0)
    ) {
      context.setFirstTokenReceived(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vercelMessages])

  // Keep the app-wide isGenerating flag in lockstep with the SDK stream status
  // so the send/stop button and spinners settle when a turn ends. The SDK owns
  // the real lifecycle; nothing reliably cleared this on a successful finish
  // before (only on error). Depends on the streaming transition, not on
  // isGenerating, so it can't race the synchronous setIsGenerating(true) that
  // handleSendMessage does before the stream starts.
  useEffect(() => {
    if (!isStreaming && context.isGenerating) {
      context.setIsGenerating(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming])

  const handleNewChat = async () => {
    if (!context.selectedWorkspace) return

    // Abort any in-flight stream from the chat we're leaving. Without this the
    // old request keeps draining and its tokens/onFinish land on the previous
    // chat's store (the "resposta volta na conversa anterior" bug) — and, worse,
    // an auto-resubmit could fire after we've already switched away.
    stop()
    resubmittedTurnsRef.current.clear()

    // Notifies AgentSessionProvider (a sibling, not a dependency of this
    // provider) to reset the "__new__" agent session — see newChatSignal's
    // doc comment in context/context.tsx.
    context.setNewChatSignal(n => n + 1)

    // Allocate the next chat's id up front so useChat mounts on a fresh, empty,
    // stable store — no null -> realId transition during the first send.
    const newId = crypto.randomUUID()
    pendingNewChatIdRef.current = newId
    seededIdRef.current = newId // an empty new chat needs no DB seed
    setActiveChatId(newId)
    setMessages([])

    context.setSelectedAssistant(null)
    context.setUserInput("")
    context.setChatMessages([])
    context.setSelectedChat(null)
    context.setIsGenerating(false)
    context.setFirstTokenReceived(false)
    router.push(`/${context.selectedWorkspace.id}/chat`)
  }

  const handleFocusChatInput = () => {
    chatInputRef.current?.focus()
  }
  const handleStopMessage = () => stop()
  const handleSendEdit = async () => {}

  const handleSendMessage = async (
    messageContent: string,
    chatMessages: ChatMessage[],
    isRegeneration: boolean
  ) => {
    logger.debug("handleSendMessage called", {
      len: messageContent.length,
      isSending: isSendingRef.current,
      isRegeneration
    })
    if (isSendingRef.current || !messageContent.trim()) return
    isSendingRef.current = true

    try {
      context.setUserInput("")
      context.setIsGenerating(true)
      context.setFirstTokenReceived(false)

      // Ensure a chat row exists — created under activeChatId so the useChat id
      // never has to change.
      let currentChat = context.selectedChat
      if (!currentChat) {
        currentChat = await createChat({
          id: pendingNewChatIdRef.current,
          workspace_id: context.selectedWorkspace!.id,
          user_id: context.profile!.id,
          name: messageContent.substring(0, 50),
          model: context.chatSettings?.model || "custom",
          prompt: context.chatSettings?.prompt || "",
          temperature: context.chatSettings?.temperature || 0.5,
          context_length: context.chatSettings?.contextLength || 4000,
          embeddings_provider: "openai"
        })
        // Carry any agent session built under the transient "__new__" bucket
        // onto the real chat id BEFORE setSelectedChat fires AgentSessionProvider's
        // [selectedChat?.id] effect. Otherwise that effect sees a fresh id with no
        // session, builds a blank one, and applies it to the view — wiping the
        // active .agent (flowState/persona) on the very first message. The
        // onboarding and right-sidebar drop flows already migrate here; the plain
        // type-and-Enter path is the one that was missing it.
        context.migrateChatAgentSession(
          context.activeChatKeyRef.current,
          currentChat.id
        )
        context.setSelectedChat(currentChat)
        context.setChats(prev => [currentChat!, ...prev])
      }

      // Persist the user turn for durability (the visible bubble comes from the
      // projection once append() adds it to the SDK store).
      const seqNum =
        chatMessagesRef.current.length > 0
          ? chatMessagesRef.current[chatMessagesRef.current.length - 1].message
              .sequence_number + 1
          : 1

      await createMessages([
        {
          chat_id: currentChat.id,
          content: messageContent,
          role: "user",
          model: context.chatSettings?.model || "custom",
          user_id: context.profile!.id,
          sequence_number: seqNum
        }
      ])

      // vercelMessages already holds the conversation (seeded on open,
      // accumulated during the session), so we don't re-inject history here.
      // The route's inputs (customModel/chatSettings/behaviorState/agentPersona/
      // mcpTools) are attached by the transport's prepareSendMessagesRequest, so
      // they also ride the automatic tool-result resubmit — not just this call.
      append({ text: messageContent })
    } catch (err: any) {
      logger.error("handleSendMessage failed", { error: err.message })
      context.setIsGenerating(false)
      context.setFirstTokenReceived(false)
    } finally {
      isSendingRef.current = false
    }
  }

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
      {children}
    </ChatHandlerContext.Provider>
  )
}
