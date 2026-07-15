/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { updateChat } from "@/db/chats"
import { createChatRowOnce, prependChatOnce } from "@/lib/channels/chat-rows"
import { createMessages } from "@/db/messages"
import { ChatAgentSession } from "@/context/context"
import { ChatMessage, ChatSettings, FlowEvent, FlowEventType, LLM } from "@/types"
import { Message, Tables } from "@/types/database"
import { KnowledgeRecord } from "@/types/knowledge"
import { executeClientTool } from "@/lib/tools/orchestrator"
import { normalizeToolCall } from "@/lib/tools/normalize-tool-call"
import { runTriggerIntent } from "@/lib/tools/executors/trigger-intent"
import { buildFlowStateFromEffects } from "@/lib/runtime/advance-flow"
import { buildBehaviorStatePayload } from "@/lib/runtime/dot-agent-injector"
import {
  getMessageText,
  getToolInvocations,
  getReasoningText,
  dedupeToolCallParts
} from "@/lib/ai/ui-message-parts"
import { resolveCustomModel } from "@/lib/models/resolve-custom-model"
import { buildApiKeys } from "@/lib/models/build-api-keys"
import { parseStreamError, StreamErrorDetails } from "@/lib/errors/api-error"
import { translateErrorMessage } from "@/lib/errors/auto-translate"
import { logger } from "@/lib/logger"
import { channelStore, ChannelStatus } from "@/lib/store/channel-store"
import { toast } from "sonner"

// The domain logic of ONE chat channel — plain TypeScript, no React. See ADR-0007.
//
// One instance per thread. Everything that used to sit inside the single
// ChatHandlerProvider (and therefore read GLOBAL state, which is what leaked one
// chat's agent into another) lives here instead, bound to exactly one thread and
// exactly one agent session.
//
// The <ChatChannel> shell owns the useChat() hook and does nothing but forward the
// SDK's callbacks into this object, refreshing `deps`/`engine` on every render.
// useChat is therefore just the current ENGINE behind the channel: swapping it for
// a vanilla `Chat` in a worker (plan 003) would not touch this file.

export interface ChannelDeps {
  // App-level config, refreshed every render by the shell.
  chatSettings: ChatSettings | null
  profile: Tables<"profiles"> | null
  models: Tables<"models">[]
  availableLocalModels: LLM[]
  backgroundModel: LLM | null
  builtInModel: LLM | undefined
  language: string
  mcpTools: any[]
  selectedWorkspaceId: string | undefined
  selectedChat: Tables<"chats"> | null

  // Access to THE ORIGINATING agent session — the whole point of this class.
  // Never read the global flowState/flowEngine/agentPersona: those reflect the
  // chat being VIEWED, which is how a background chat's request used to travel
  // with another agent's FSM and get answered as "offtopic".
  getAgentSession: (agentSessionId: string) => ChatAgentSession | undefined
  updateAgentSession: (
    agentSessionId: string,
    patch: Partial<ChatAgentSession>
  ) => void

  // Is this channel the thread currently on screen?
  isViewed: () => boolean

  // The legacy ChatbotUIContext mirror. ONLY written when isViewed() — a
  // background channel persists to the DB and updates its own state, but never
  // touches what the user is looking at. Removed once plan 014 migrates the
  // consumers onto the store.
  mirror: {
    setChatMessages: (messages: ChatMessage[]) => void
    setThinkingLog: (
      fn: (prev: Record<string, string>) => Record<string, string>
    ) => void
    setFirstTokenReceived: (value: boolean) => void
    setFlowState: (state: any) => void
    setKnowledge: (fn: (prev: KnowledgeRecord[]) => KnowledgeRecord[]) => void
  }

  // Chat lifecycle — the first send of a brand-new thread creates its DB row.
  setSelectedChat: (chat: Tables<"chats">) => void
  setChats: (fn: (prev: Tables<"chats">[]) => Tables<"chats">[]) => void
  setUserInput: (value: string) => void
}

// The streaming engine's imperative surface — supplied by the <ChatChannel> shell
// from its useChat() instance, refreshed each render.
export interface ChannelEngine {
  append: (message: { text: string }) => void
  stop: () => void
  setMessages: (messages: any[]) => void
  addToolOutput: (output: any) => void
}

// Hard cap on automatic tool-result resubmits within a single user turn. A
// misbehaving local model can keep firing trigger_intent every step (never
// producing a text answer) and, since some servers reuse tool_call ids, that runs
// away and corrupts the history. Enforced idempotently from the message list in
// shouldAutoResubmit(); the v5 answer to v4's maxSteps: 5.
const MAX_AUTO_STEPS = 6

export class ChannelController {
  readonly threadId: string

  // TODAY: one thread has at most one agent, so the session id IS the thread id.
  // The two are named apart because the future is 1 chat : N agents, with each
  // subagent owning its own subchat (1:1) — see plan 015. When that lands, a
  // thread carries `agentSessionIds: string[]` and this getter becomes a lookup
  // of "which session drives this invocation", not an identity.
  get agentSessionId(): string {
    return this.threadId
  }

  private deps!: ChannelDeps
  private engine!: ChannelEngine

  // This channel's OWN projected message list. Not the global chatMessages: a
  // background channel must compute its sequence numbers and merge its rows
  // against ITS history, not against whatever chat the user happens to be
  // looking at.
  private messages: ChatMessage[] = []

  private isSending = false
  private seeded = false
  private chatRowExists = false

  // One-shot guard so a tool turn is resubmitted EXACTLY once. The SDK triggers
  // the automatic resubmit from two independent places (ai/dist index.js): the end
  // of makeRequest, and inside addToolOutput. Both only guard on `status`, and our
  // addToolOutput is necessarily fire-and-forget (it enqueues on the same
  // SerialJobExecutor already running onToolCall, so awaiting it would deadlock).
  // If that deferred output lands in the microtask window between setStatus("ready")
  // and the resubmit flipping status to "submitted", BOTH fire -> the same tool turn
  // is POSTed twice, and a local model that reuses call_ ids re-emits the tool call
  // -> duplicated call_… in the history. Keyed on the tool-bearing assistant message
  // id, so whichever trigger wins resubmits and the other is a no-op.
  private resubmittedTurns = new Set<string>()

  constructor(threadId: string) {
    this.threadId = threadId
  }

  refresh(deps: ChannelDeps, engine: ChannelEngine): void {
    this.deps = deps
    this.engine = engine
  }

  // ---------------------------------------------------------------- lifecycle

  // Seed the engine with this thread's persisted history, exactly once. Only ever
  // called while the channel is the viewed one (a channel is created either by
  // being viewed, or by continuing a stream it started while viewed), so the
  // caller's already-loaded list is this thread's own history.
  seed(history: ChatMessage[]): void {
    if (this.seeded) return
    this.seeded = true
    this.messages = history
    this.chatRowExists = history.length > 0 || !!this.deps.selectedChat
    this.engine.setMessages(
      history.map(cm => ({
        id: cm.message.id,
        role: cm.message.role as "user" | "assistant" | "system",
        parts: [{ type: "text", text: cm.message.content }]
      })) as any
    )
  }

  get hasSeeded(): boolean {
    return this.seeded
  }

  setStatus(status: ChannelStatus): void {
    channelStore.getState().patchChannel(this.threadId, { status })
  }

  // ------------------------------------------------------------------- debug

  // Real-time debug mirror: each actual exchange step is pushed as a flowEvent the
  // chat renders inline, in order. Stored UNDER this channel's threadId, so a
  // background channel's events can neither render inside another chat nor evict
  // its history.
  pushDebug(type: FlowEventType, data: any): string {
    const id = crypto.randomUUID()
    channelStore.getState().pushFlowEvent(this.threadId, {
      id,
      seqNum: this.messages.length,
      type,
      timestamp: Date.now(),
      data
    })
    return id
  }

  // Shared by every "error" flowEvent producer (the SDK's onError, and
  // trigger_intent's catch) so the debug bubble, the toast and the fire-and-forget
  // translation can't drift into two versions. Translation never blocks or throws:
  // on failure the bubble just keeps the original text.
  reportError(details: StreamErrorDetails | { message: string }): void {
    const id = this.pushDebug("error", details)
    toast.error(`Failed to get a response: ${details.message}`)
    const translateModel = this.deps.backgroundModel ?? this.deps.builtInModel
    if (translateModel) {
      translateErrorMessage(
        details.message,
        translateModel,
        this.deps.language
      ).then(translatedMessage => {
        if (translatedMessage) {
          channelStore
            .getState()
            .patchFlowEvent(this.threadId, id, { translatedMessage })
        }
      })
    }
  }

  // ----------------------------------------------------------------- request

  // The whole outgoing body, so every request — the first send AND the automatic
  // tool-result resubmit — carries the route's inputs. Without this the resubmit
  // POSTs an empty body and the route throws "base_url required".
  buildRequestBody({
    messages,
    id,
    body
  }: {
    messages: any[]
    id: string
    body?: any
  }): { body: any } {
    // Strip the phantom duplicate tool-call parts the SDK's resubmit leaves in the
    // store, so the model never receives the same toolCallId twice — that duplicate
    // is what cascades into re-reasoning / MissingToolResults. Purely on the
    // outgoing wire; the SDK store is untouched.
    const dedupedMessages = dedupeToolCallParts(messages as any)

    // THE FIX (ADR-0007): persona + FSM state come from THIS channel's own agent
    // session, looked up by agentSessionId. Reading the global flowState/persona
    // here is what made a message sent in chat B travel with chat A's agent and
    // come back classified as "offtopic".
    const session = this.deps.getAgentSession(this.agentSessionId)

    const finalBody = {
      ...body,
      chatSettings: this.deps.chatSettings,
      customModel: resolveCustomModel(
        this.deps.models,
        this.deps.availableLocalModels,
        this.deps.chatSettings?.model
      ),
      apiKeys: buildApiKeys(this.deps.profile),
      behaviorState: session?.flowState || undefined,
      agentPersona: session?.agentMeta?.persona || undefined,
      mcpTools: this.deps.mcpTools,
      messages: dedupedMessages,
      id
    }

    // Mirror the exact client -> route POST (one per send AND per auto-resubmit).
    // Redact api_key/apiKeys; keep everything else verbatim.
    const { customModel, apiKeys, ...restBody } = finalBody as any
    this.pushDebug("client_request", {
      api: this.apiPath,
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

  private apiPath = "/api/chat/custom"
  setApiPath(path: string): void {
    this.apiPath = path
  }

  // --------------------------------------------------------- stream callbacks

  // The route emits a transient data-debug part with the exact system + final model
  // messages it sent; mirror it as a server_prompt event (the "what really went to
  // the model" half of the debug view).
  onData(part: any): void {
    if (part?.type === "data-debug") {
      this.pushDebug("server_prompt", part.data)
    }
  }

  // When the assistant turn ends with client-executed tool calls (ours all run in
  // onToolCall, never server-side), resubmit automatically so the tool results go
  // back to the model for its follow-up answer. Without this the turn stalls with an
  // unanswered tool call and the next user turn dies server-side with
  // AI_MissingToolResultsError. The v5 replacement for v4's useChat({ maxSteps }).
  shouldAutoResubmit(messages: any[]): boolean {
    // The SDK calls this more than once per step, from two places with a race window
    // between them, so it must NOT carry cumulative side effects (a mutating ++
    // counter over-counts). Two idempotent guards instead:
    //   1. Runaway cap, counted from the messages themselves.
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
    //   2. One-shot per tool-bearing assistant message: dedupe the two triggers by
    //      identity so a turn resubmits exactly once. Adding an already-present id
    //      is a no-op — safe under repeat calls.
    const turnKey = (messages[messages.length - 1] as any)?.id
    if (turnKey) {
      if (this.resubmittedTurns.has(turnKey)) return false
      this.resubmittedTurns.add(turnKey)
    }
    return true
  }

  async onToolCall(toolCall: any): Promise<void> {
    const tc = toolCall as {
      toolCallId: string
      toolName: string
      input: any
    }

    // Always THIS channel's session — never the globally-viewed one.
    const session = this.deps.getAgentSession(this.agentSessionId)
    const engineFsm = session?.proxy as any

    logger.debug("onToolCall invoked", {
      threadId: this.threadId,
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      intentName: tc.input?.intent_name,
      kernelState: engineFsm?.get_current_state?.(),
      kernelValidIntents: engineFsm?.get_valid_intents?.(),
      sessionFlowState: session?.flowState?.currentState
    })

    this.pushDebug("tool_call", {
      toolName: tc.toolName,
      intentName: tc.input?.intent_name,
      args: tc.input
    })

    // The SDK DISCARDS onToolCall's return value. A client-side tool output has to
    // be recorded with addToolOutput, which also flips the tool part to
    // output-available so the auto-resubmit sends the result to the model.
    // Returning a value here left the call unanswered -> MissingToolResultsError.
    const report = (output: any) =>
      this.engine.addToolOutput({
        tool: tc.toolName,
        toolCallId: tc.toolCallId,
        output
      })

    // trigger_intent is the FSM's transition signal. Advance THIS channel's kernel,
    // awaited, then report the new state as the tool output so it travels to the
    // model in the resubmit. The kernel stays the single source of truth; flowState
    // is only a derived view for the right-sidebar panel.
    if (tc.toolName === "trigger_intent" && engineFsm) {
      const intentName = tc.input?.intent_name
      // Keep the debug-panel event bridge (murici:tool_call) firing.
      runTriggerIntent(tc.input, tc)
      if (!intentName) {
        report({ error: "trigger_intent called without intent_name" })
        return
      }
      // Reject an intent that isn't valid in the CURRENT state rather than advancing
      // the FSM somewhere wrong. A model that ignores the freshly transitioned state
      // — or a duplicated/stale tool call from a server that reuses tool_call ids —
      // keeps re-firing the PREVIOUS intent, which is no longer allowed here.
      const validIntents: string[] = engineFsm.get_valid_intents?.() || []
      if (validIntents.length > 0 && !validIntents.includes(intentName)) {
        logger.warn("trigger_intent rejected: not allowed in current state", {
          threadId: this.threadId,
          intentName,
          validIntents
        })
        // A rejected re-fire is almost always the model repeating the intent it
        // ALREADY triggered. Don't just say "not allowed" — tell it the transition
        // happened and to produce the answer, so it recovers on the next resubmit
        // instead of looping the same call.
        const cur = session?.flowState
        report({
          error: `Intent "${intentName}" is not valid now. The flow already advanced to state "${cur?.currentState}". Do NOT call trigger_intent again for this — reply to the user with text to fulfill the current goal.`,
          current_state: cur?.currentState,
          goal: cur?.goal,
          allowed_intents: validIntents
        })
        return
      }
      try {
        const from = engineFsm.get_current_state()
        const effects = await engineFsm.send_intent(intentName)
        const advanced = buildFlowStateFromEffects(
          engineFsm,
          effects,
          session?.knowledge ?? []
        )

        // Persist the advance on THIS channel's session, always — including the
        // visited-state history and the graph, so a chat whose agent advanced while
        // it was in the BACKGROUND still shows a complete "Histórico de Estados"
        // when the user comes back to it. (For the viewed chat AgentSessionProvider
        // recomputes the same thing off the global flowState below; both paths agree,
        // and doing it here is what makes the background path complete on its own.)
        const visitedOrder = session?.visitedOrder?.includes(advanced.currentState)
          ? session.visitedOrder
          : [...(session?.visitedOrder ?? []), advanced.currentState]
        const graphData = engineFsm.get_graph?.() ?? session?.graphData ?? null

        this.deps.updateAgentSession(this.agentSessionId, {
          flowState: advanced,
          currentState: advanced.currentState,
          visitedOrder,
          graphData
        })

        // Mirror into the global flowState (which drives the right-sidebar FSM panel)
        // ONLY when this is the chat on screen — otherwise a background agent's
        // transition would repaint the panel of the chat the user is looking at.
        if (this.deps.isViewed()) {
          this.deps.mirror.setFlowState(advanced)
        }

        const payload = buildBehaviorStatePayload(advanced)
        this.pushDebug("fsm_transition", {
          from,
          to: advanced.currentState,
          newGoal: advanced.goal,
          newGuide: advanced.guide,
          effects
        })
        this.pushDebug("tool_result", {
          toolName: "trigger_intent",
          output: payload
        })
        report(payload)
      } catch (err: any) {
        logger.error("trigger_intent advance failed", { error: err.message })
        this.reportError({ message: err.message || "Failed to advance the flow" })
        report({ error: err.message || "Failed to advance the flow" })
      }
      return
    }

    // Everything else (MCP, save_doc, state_graph) runs through the orchestrator.
    // v5 tool calls carry arguments on `input`; normalizeToolCall maps that to the
    // orchestrator's `args`.
    const result = await executeClientTool(normalizeToolCall(tc), {
      chatId: this.threadId,
      messageId: tc.toolCallId,
      promptMessageId: "",
      behaviorState: session?.flowState || undefined
    })
    this.pushDebug("tool_result", { toolName: tc.toolName, output: result })

    // runSaveDoc already persisted the record; mirror it into context.knowledge so
    // the right sidebar's "Arquivos do Chat" list picks it up without a reload.
    // Viewed-only: a background chat's save_doc must not pop its file into the chat
    // the user is currently looking at.
    if (
      tc.toolName === "murici__save_doc" &&
      result?.record &&
      this.deps.isViewed()
    ) {
      this.deps.mirror.setKnowledge(prev => {
        if (prev.length === 0) {
          window.dispatchEvent(new CustomEvent("murici:knowledge-panel-open"))
        }
        return [...prev, result.record]
      })
    }

    report(result)
  }

  // The AI SDK calls this with { message, messages, isAbort, ... } — NOT the message
  // itself (ChatOnFinishCallback). We only persist here; the projection already put
  // the streamed reply on screen, so this does not touch the message list (doing so
  // is what used to overwrite the visible reply with an empty row).
  async onFinish(message: any): Promise<void> {
    logger.debug("channel onFinish", {
      threadId: this.threadId,
      role: message?.role,
      textLen: getMessageText(message).length
    })
    this.pushDebug("llm_response", {
      role: message?.role,
      text: getMessageText(message),
      parts: message?.parts
    })

    // Persist under THIS channel's threadId and against THIS channel's own message
    // list. Reading the global chatMessages here would compute the sequence number
    // from whatever chat is on screen — wrong the moment a background chat finishes.
    const projected = this.messages.find(c => c.message.id === message.id)
    const seqNum =
      projected?.message.sequence_number ??
      (this.messages.length > 0
        ? this.messages[this.messages.length - 1].message.sequence_number + 1
        : 1)

    await createMessages([
      {
        id: message.id,
        chat_id: this.threadId,
        content: getMessageText(message),
        role: message.role as "user" | "assistant" | "system" | "tool",
        model: this.deps.chatSettings?.model || "custom",
        user_id: this.deps.profile!.id,
        sequence_number: seqNum
      }
    ])

    await updateChat(this.threadId, { updated_at: new Date().toISOString() })
  }

  onError(error: Error): void {
    // error.stack included so a React-internal failure surfacing through this
    // callback (e.g. "Maximum update depth exceeded") carries its component stack.
    logger.error("channel stream error", {
      threadId: this.threadId,
      error: error.message,
      stack: error.stack
    })
    this.reportError(parseStreamError(error.message))
    channelStore.getState().patchChannel(this.threadId, {
      status: "error",
      firstTokenReceived: false
    })
  }

  // -------------------------------------------------------------- projection

  // The single one-way projection: SDK messages -> DB-shaped ChatMessage rows.
  // Existing rows are merged by id so created_at / sequence_number stay stable (no
  // timestamp churn, no key thrash) while new/streaming rows are filled in.
  project(vercelMessages: any[]): void {
    if (vercelMessages.length === 0) return

    // Collapse the SDK-store phantom tool-call copies BEFORE projecting, so the UI
    // and the persisted rows show each tool call once.
    const sdkMessages = dedupeToolCallParts(vercelMessages as any)

    const prevById = new Map(this.messages.map(cm => [cm.message.id, cm]))
    const nextThinking: Record<string, string> = {}

    const projected: ChatMessage[] = sdkMessages.map((m: any, i: number) => {
      const prev = prevById.get(m.id)
      const content = getMessageText(m)
      const tools = getToolInvocations(m)
      const reasoning = getReasoningText(m)
      if (reasoning) nextThinking[m.id] = reasoning

      const message: Message = {
        id: m.id,
        chat_id: this.threadId,
        user_id: prev?.message.user_id ?? "local",
        assistant_id: prev?.message.assistant_id ?? null,
        role: m.role as Message["role"],
        content,
        model: prev?.message.model ?? this.deps.chatSettings?.model ?? "custom",
        sequence_number: prev?.message.sequence_number ?? i + 1,
        tool_calls: tools,
        tool_call_id: prev?.message.tool_call_id,
        image_paths: prev?.message.image_paths ?? [],
        created_at: prev?.message.created_at ?? new Date().toISOString(),
        updated_at: prev?.message.updated_at ?? null
      }
      return { message, fileItems: prev?.fileItems ?? [] }
    })

    // This channel's own list is always kept current — that is what its sequence
    // numbers and merges are computed from, whether or not anyone is watching.
    this.messages = projected

    const last = sdkMessages[sdkMessages.length - 1]
    const gotFirstToken =
      last?.role === "assistant" &&
      (getMessageText(last).length > 0 ||
        getToolInvocations(last).length > 0 ||
        getReasoningText(last).length > 0)
    if (gotFirstToken) {
      channelStore
        .getState()
        .patchChannel(this.threadId, { firstTokenReceived: true })
    }

    // Only the channel on screen writes the legacy mirror the UI reads today.
    if (this.deps.isViewed()) {
      this.deps.mirror.setChatMessages(projected)
      if (Object.keys(nextThinking).length > 0) {
        this.deps.mirror.setThinkingLog(prev => ({ ...prev, ...nextThinking }))
      }
      if (gotFirstToken) {
        this.deps.mirror.setFirstTokenReceived(true)
      }
    }
  }

  // Re-push this channel's current state into the legacy mirror. Called when a
  // channel BECOMES the viewed one (e.g. the user comes back to a chat that kept
  // streaming in the background), so the screen catches up with everything that
  // arrived while they were away.
  syncMirror(): void {
    if (!this.deps.isViewed()) return
    if (this.messages.length > 0) {
      this.deps.mirror.setChatMessages(this.messages)
    }
    const session = this.deps.getAgentSession(this.agentSessionId)
    if (session?.flowState) {
      this.deps.mirror.setFlowState(session.flowState)
    }
  }

  // ----------------------------------------------------------------- actions

  async send(messageContent: string): Promise<void> {
    logger.debug("channel send", {
      threadId: this.threadId,
      len: messageContent.length,
      isSending: this.isSending
    })
    if (this.isSending || !messageContent.trim()) return
    this.isSending = true

    try {
      this.deps.setUserInput("")
      channelStore.getState().patchChannel(this.threadId, {
        status: "submitted",
        firstTokenReceived: false
      })
      if (this.deps.isViewed()) {
        this.deps.mirror.setFirstTokenReceived(false)
      }

      // Ensure a chat row exists. The thread was born with its final id (a uuid
      // minted up front), so the row is simply created UNDER that id — there is no
      // provisional "__new__" bucket and no id migration. That migration step is
      // exactly where "novo chat inheriting the previous agent" came from (ADR-0002).
      //
      // createChatRowOnce, not createChat: the onboarding auto-load creates the row for
      // this same thread too, and a user who types before it finishes unpacking the
      // .agent gets here first. Both creating meant two rows in the sidebar.
      if (!this.chatRowExists && !this.deps.selectedChat) {
        const currentChat = await createChatRowOnce(this.threadId, () => ({
          workspace_id: this.deps.selectedWorkspaceId!,
          user_id: this.deps.profile!.id,
          name: messageContent.substring(0, 50),
          model: this.deps.chatSettings?.model || "custom",
          prompt: this.deps.chatSettings?.prompt || "",
          temperature: this.deps.chatSettings?.temperature || 0.5,
          context_length: this.deps.chatSettings?.contextLength || 4000,
          embeddings_provider: "openai"
        }))
        this.chatRowExists = true
        this.deps.setSelectedChat(currentChat)
        this.deps.setChats(prev => prependChatOnce(prev, currentChat))
      } else {
        this.chatRowExists = true
      }

      // Persist the user turn for durability (the visible bubble comes from the
      // projection once append() adds it to the SDK store).
      const seqNum =
        this.messages.length > 0
          ? this.messages[this.messages.length - 1].message.sequence_number + 1
          : 1

      await createMessages([
        {
          chat_id: this.threadId,
          content: messageContent,
          role: "user",
          model: this.deps.chatSettings?.model || "custom",
          user_id: this.deps.profile!.id,
          sequence_number: seqNum
        }
      ])

      // The engine already holds the conversation (seeded on open, accumulated
      // during the session), so history is not re-injected here. The route's inputs
      // ride buildRequestBody, so they also travel on the automatic resubmit.
      this.engine.append({ text: messageContent })
    } catch (err: any) {
      logger.error("channel send failed", {
        threadId: this.threadId,
        error: err.message
      })
      channelStore
        .getState()
        .patchChannel(this.threadId, { status: "error", firstTokenReceived: false })
    } finally {
      this.isSending = false
    }
  }

  stop(): void {
    this.engine.stop()
  }

  dispose(): void {
    channelStore.getState().dropChannel(this.threadId)
  }
}
