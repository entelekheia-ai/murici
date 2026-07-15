/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import type { ChannelController } from "./channel-controller"

// Live ChannelControllers, keyed by threadId. A <ChatChannel> registers its
// controller on mount and unregisters on unmount; the useChatHandler() facade
// looks up the VIEWED thread's controller here to delegate send/stop to it.
//
// Module-level (not React state) on purpose: the controllers are plain TS
// objects and nothing about this lookup should trigger a render. See ADR-0007.
const controllers = new Map<string, ChannelController>()

export function registerController(
  threadId: string,
  controller: ChannelController
): void {
  controllers.set(threadId, controller)
}

export function unregisterController(threadId: string): void {
  controllers.delete(threadId)
}

export function getController(
  threadId: string | null | undefined
): ChannelController | undefined {
  return threadId ? controllers.get(threadId) : undefined
}
