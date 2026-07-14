/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { createChat } from "@/db/chats"
import { Tables, TablesInsert } from "@/types/database"

/**
 * Create a thread's chat row exactly once, no matter who asks first.
 *
 * Two callers need that row and they RACE:
 *   - ChannelController.send(), on the user's first message;
 *   - the first-run onboarding auto-load (right-sidebar), which only gets there after
 *     fetching and unpacking the .agent and loading its FSM — so a user who types
 *     straight away beats it.
 *
 * Since ADR-0007 a thread is born with its FINAL id, so both were calling createChat()
 * under the SAME id and both prepended the result to `chats`: a duplicated row in the
 * sidebar and React's "two children with the same key". Whoever arrives first creates
 * the row; everyone else awaits that same promise and gets the same chat back.
 *
 * The map is keyed by threadId and entries are never reused (ids are uuids), so it only
 * ever holds the threads created in this tab's lifetime.
 */
const inFlight = new Map<string, Promise<Tables<"chats">>>()

export function createChatRowOnce(
  threadId: string,
  build: () => TablesInsert<"chats">
): Promise<Tables<"chats">> {
  const existing = inFlight.get(threadId)
  if (existing) return existing

  const pending = createChat({ ...build(), id: threadId })
  inFlight.set(threadId, pending)
  // A failed create must not poison the thread forever — let the next caller retry.
  pending.catch(() => inFlight.delete(threadId))
  return pending
}

/**
 * Prepend a chat to the sidebar list without ever adding it twice. Both creators call
 * this, so even if they both run, the list stays right.
 */
export function prependChatOnce(
  chats: Tables<"chats">[],
  chat: Tables<"chats">
): Tables<"chats">[] {
  return chats.some(c => c.id === chat.id) ? chats : [chat, ...chats]
}
