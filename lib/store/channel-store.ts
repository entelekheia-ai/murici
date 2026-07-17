/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { FlowEvent } from "@/types"
import { Effect } from "@/types/kernel-effect"
import { patchFlowEventById } from "@/lib/utils/flow-events"
import { foldCssEffects } from "@/lib/utils/css-effects"
import { create } from "zustand"

// Runtime state of the app's chat CHANNELS — see project/adr/0007.
//
// A "channel" is one thread's live stream (its own useChat instance + its own
// ChannelController). Channels run in PARALLEL: a chat can keep streaming in the
// background while the user looks at a different one.
//
// Deliberately small. The per-channel MESSAGES are not here — they already live
// inside each channel's own useChat store, which is the per-thread message store.
// What this store holds is only what someone OUTSIDE a channel needs to know:
//   - which thread is on screen (`viewedThreadId`)
//   - which threads have a request in flight (so the host keeps them mounted, and
//     so the sidebar can badge a chat that is still generating in the background)
//
// It grows as consumers migrate off the legacy ChatbotUIContext mirror — see
// project/plans/014-channel-store-consumer-migration.md.
//
// Keyed by `threadId`, NOT "chat id": a thread is a chat **or** (in the future) a
// subagent's subchat. Today `threadId === chatId`. See
// project/plans/015-future-agent-topology.md.

export type ChannelStatus = "ready" | "submitted" | "streaming" | "error"

export interface ChannelRuntimeState {
  status: ChannelStatus
  // Mirrors the SDK's "the assistant has produced something for this turn"
  // signal; drives the waiting-for-first-token placeholder.
  firstTokenReceived: boolean
}

interface ChannelStore {
  viewedThreadId: string | null
  channels: Record<string, ChannelRuntimeState>

  // The debug/error timeline, PER THREAD. It used to be one global capped array
  // whose entries carried a chatId, filtered at render time — which meant a chatty
  // background channel could evict the debug history of the chat you were actually
  // looking at, and the id lived in two places (the entry AND the filter). Keying
  // by threadId caps each thread on its own and makes the tag redundant.
  //
  // NOT tied to `channels`: a thread's events outlive its channel, so re-opening a
  // chat you left still shows what happened in it this session.
  flowEvents: Record<string, FlowEvent[]>

  // A thread's DESIRED presentation CSS, per project/plans/017. This is the
  // single source of truth an agent's `apply css`/`remove css` effects write
  // into — from EITHER the initial load or a `send_intent` advance, whether or
  // not the thread is on screen. The DOM only ever mirrors
  // activeCss[viewedThreadId] (see KernelPresentationHost) — nothing reads or
  // writes document.head directly from here.
  //
  // NOT tied to `channels`, same reasoning as `flowEvents`: a background
  // thread's ChatChannel unmounts (and dropChannel()s) as soon as its reply
  // finishes and it isn't the viewed thread — exactly the off-screen scenario
  // this pipeline exists for. Clearing activeCss there would wipe an agent's
  // theme the moment it finished applying it in the background, before the
  // user ever switched back to see it.
  activeCss: Record<string, string[]>

  setViewedThreadId: (threadId: string | null) => void
  patchChannel: (threadId: string, patch: Partial<ChannelRuntimeState>) => void
  dropChannel: (threadId: string) => void
  pushFlowEvent: (threadId: string, event: FlowEvent) => void
  patchFlowEvent: (
    threadId: string,
    eventId: string,
    patch: Record<string, any>
  ) => void
  ingestCssEffects: (
    threadId: string,
    effects: Effect[] | undefined | null
  ) => void
}

const IDLE: ChannelRuntimeState = {
  status: "ready",
  firstTokenReceived: false
}

// Per THREAD, not per app: one chat's debug traffic can no longer push another
// chat's out of the window.
const FLOW_EVENTS_CAP = 200

export const useChannelStore = create<ChannelStore>(set => ({
  viewedThreadId: null,
  channels: {},
  flowEvents: {},
  activeCss: {},

  setViewedThreadId: threadId => set({ viewedThreadId: threadId }),

  patchChannel: (threadId, patch) =>
    set(state => {
      const prev = state.channels[threadId] ?? IDLE
      const next = { ...prev, ...patch }
      if (
        prev.status === next.status &&
        prev.firstTokenReceived === next.firstTokenReceived
      ) {
        return state
      }
      return { channels: { ...state.channels, [threadId]: next } }
    }),

  dropChannel: threadId =>
    set(state => {
      // activeCss deliberately NOT cleared here — see the field's doc comment.
      if (!(threadId in state.channels)) return state
      const { [threadId]: _dropped, ...restChannels } = state.channels
      return { channels: restChannels }
    }),

  ingestCssEffects: (threadId, effects) =>
    set(state => {
      const prev = state.activeCss[threadId] ?? []
      const next = foldCssEffects(prev, effects)
      if (next === prev) return state
      return { activeCss: { ...state.activeCss, [threadId]: next } }
    }),

  pushFlowEvent: (threadId, event) =>
    set(state => {
      const prev = state.flowEvents[threadId] ?? []
      const next = [...prev, event]
      return {
        flowEvents: {
          ...state.flowEvents,
          [threadId]:
            next.length > FLOW_EVENTS_CAP
              ? next.slice(next.length - FLOW_EVENTS_CAP)
              : next
        }
      }
    }),

  patchFlowEvent: (threadId, eventId, patch) =>
    set(state => {
      const prev = state.flowEvents[threadId]
      if (!prev) return state
      const next = patchFlowEventById(prev, eventId, patch)
      if (next === prev) return state
      return { flowEvents: { ...state.flowEvents, [threadId]: next } }
    })
}))

// Zustand's vanilla core: the ChannelController is plain TS (no React) and writes
// through this, with no setter bridge from a component. That is what lets the
// domain logic live outside React — see ADR-0007.
export const channelStore = useChannelStore

export function isChannelBusy(state: ChannelRuntimeState | undefined): boolean {
  return state?.status === "streaming" || state?.status === "submitted"
}

// The set of threads that must have a MOUNTED channel right now:
// the one on screen, plus every thread with a request still in flight (so a
// background stream is never killed by the user navigating away).
export function selectLiveThreadIds(state: ChannelStore): string[] {
  const live = new Set<string>()
  if (state.viewedThreadId) live.add(state.viewedThreadId)
  for (const [threadId, channel] of Object.entries(state.channels)) {
    if (isChannelBusy(channel)) live.add(threadId)
  }
  return [...live]
}

// "Is this thread generating right now?" — used by the sidebar row badge so the
// user can see that a chat they navigated away from is still producing a reply
// (the affordance that replaces handleNewChat's old abort).
export function selectIsThreadBusy(threadId: string | undefined) {
  return (state: ChannelStore): boolean =>
    !!threadId && isChannelBusy(state.channels[threadId])
}

// A stable empty array: returning a fresh `[]` from a selector would give Zustand a
// new reference every render and re-render the subscriber forever.
const NO_EVENTS: FlowEvent[] = []

export function selectViewedFlowEvents(state: ChannelStore): FlowEvent[] {
  if (!state.viewedThreadId) return NO_EVENTS
  return state.flowEvents[state.viewedThreadId] ?? NO_EVENTS
}

// Same stable-empty-array trick as selectViewedFlowEvents. KernelPresentationHost
// (project/plans/017) subscribes to this directly — no useShallow needed, since
// activeCss[threadId] only ever changes reference via ingestCssEffects, which
// itself preserves reference on a no-op fold.
const NO_CSS: string[] = []

export function selectViewedActiveCss(state: ChannelStore): string[] {
  if (!state.viewedThreadId) return NO_CSS
  return state.activeCss[state.viewedThreadId] ?? NO_CSS
}
