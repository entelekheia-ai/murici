/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import {
  getAllConversations,
  getConversationById,
  createConversation,
  updateConversation,
  deleteConversation
} from "@/lib/local-db/conversations"
import { Chat } from "@/types/database"
import { v4 as uuidv4 } from "uuid"

function toChat(c: any): Chat {
  return {
    id: c.id,
    user_id: "local",
    workspace_id: "local",
    assistant_id: null,
    title: c.title ?? "New Chat",
    name: c.title ?? "New Chat",
    model: c.model ?? "",
    prompt: "",
    temperature: c.temperature ?? 0.5,
    context_length: c.contextLength ?? 4096,
    include_profile_context: false,
    include_workspace_instructions: false,
    embeddings_provider: "openai",
    created_at: c.createdAt ?? new Date().toISOString(),
    updated_at: c.updatedAt ?? null,
    sharing: "private",
    folder_id: null,
    last_shared_message_id: null,
    image_paths: []
  }
}

export async function getChats(workspaceId: string): Promise<Chat[]> {
  const convs = await getAllConversations()
  return convs.map(toChat).reverse()
}

export async function getChatsByWorkspaceId(workspaceId: string): Promise<Chat[]> {
  return getChats(workspaceId)
}

export async function getChatById(chatId: string): Promise<Chat | null> {
  const conv = await getConversationById(chatId)
  return conv ? toChat(conv) : null
}

export async function createChat(chat: Partial<Chat>): Promise<Chat> {
  const conv = await createConversation({
    id: chat.id ?? uuidv4(),
    title: chat.title ?? chat.name ?? "New Chat",
    model: chat.model ?? "",
    provider: "",
    temperature: chat.temperature ?? 0.5,
    contextLength: chat.context_length ?? 4096
  })
  return toChat(conv)
}

export async function updateChat(
  chatId: string,
  updates: Partial<Chat>
): Promise<Chat> {
  const conv = await updateConversation(chatId, {
    title: updates.title ?? updates.name,
    model: updates.model,
    temperature: updates.temperature,
    contextLength: updates.context_length
  })
  return toChat(conv)
}

export async function deleteChat(chatId: string): Promise<void> {
  await deleteConversation(chatId)
}
