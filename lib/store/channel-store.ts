/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

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

  setViewedThreadId: (threadId: string | null) => void
  patchChannel: (threadId: string, patch: Partial<ChannelRuntimeState>) => void
  dropChannel: (threadId: string) => void
}

const IDLE: ChannelRuntimeState = {
  status: "ready",
  firstTokenReceived: false
}

export const useChannelStore = create<ChannelStore>(set => ({
  viewedThreadId: null,
  channels: {},

  setViewedThreadId: threadId => set({ viewedThreadId: threadId }),

  patchChannel: (threadId, patch) =>
    set(state => {
      const prev = state.channels[threadId] ?? IDLE
      const next = { ...prev, ...patch }
      if (prev.status === next.status && prev.firstTokenReceived === next.firstTokenReceived) {
        return state
      }
      return { channels: { ...state.channels, [threadId]: next } }
    }),

  dropChannel: threadId =>
    set(state => {
      if (!(threadId in state.channels)) return state
      const { [threadId]: _dropped, ...rest } = state.channels
      return { channels: rest }
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
