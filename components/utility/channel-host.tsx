"use client"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { ChatChannel } from "@/components/utility/chat-channel"
import { useChannelStore, isChannelBusy } from "@/lib/store/channel-store"
import { FC } from "react"

// Mounts one <ChatChannel> per LIVE thread. See ADR-0007.
//
//   live = the thread on screen  ∪  every thread with a request still in flight
//
// Two things follow from that, and they are the whole point:
//
//   1. Navigating between chats does not kill a stream. This host is rendered by
//      ChatHandlerProvider, which lives in the root layout — a layout persists
//      across navigation while the PAGE below it remounts. So a chat you walked
//      away from keeps its channel mounted and its response keeps arriving, landing
//      in the chat that actually sent it.
//   2. A finished background stream is cleaned up: once it is no longer busy and no
//      longer viewed, it drops out of the live set and its channel unmounts. Its
//      messages are already persisted, so re-opening it just seeds from the DB.
//
// The channels render nothing — they are pure runtime.
export const ChannelHost: FC = () => {
  const liveThreadIds = useChannelStore(s => {
    const live = new Set<string>()
    if (s.viewedThreadId) live.add(s.viewedThreadId)
    for (const [threadId, channel] of Object.entries(s.channels)) {
      if (isChannelBusy(channel)) live.add(threadId)
    }
    // Sorted so the rendered list is stable across re-renders (the Set's iteration
    // order would otherwise depend on insertion, remounting channels needlessly).
    return [...live].sort().join(",")
  })

  const ids = liveThreadIds ? liveThreadIds.split(",") : []

  return (
    <>
      {ids.map(threadId => (
        <ChatChannel key={threadId} threadId={threadId} />
      ))}
    </>
  )
}
