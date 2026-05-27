// Stub implementations of former Supabase db/ functions.
// These are no-ops that allow the app to compile.
// Phase 1 will replace these with real IndexedDB implementations.

import { Chat, Message, Model, Folder, Prompt } from "@/types/database"
import { v4 as uuidv4 } from "uuid"

const now = () => new Date().toISOString()

// ── Chats ──────────────────────────────────────────────────────────────────

export async function createChat(chat: Partial<Chat>): Promise<Chat> {
  return { ...defaultChat(), ...chat, created_at: now() }
}

export async function updateChat(
  chatId: string,
  updates: Partial<Chat>
): Promise<Chat> {
  return { ...defaultChat(), ...updates, id: chatId, updated_at: now() }
}

export async function deleteChat(chatId: string): Promise<void> {}

export async function getChatById(chatId: string): Promise<Chat | null> {
  return null
}

export async function getChats(workspaceId: string): Promise<Chat[]> {
  return []
}

// ── Messages ───────────────────────────────────────────────────────────────

export async function createMessages(
  messages: Partial<Message>[]
): Promise<Message[]> {
  return messages.map(m => ({ ...defaultMessage(), ...m, created_at: now() }))
}

export async function updateMessage(
  messageId: string,
  updates: Partial<Message>
): Promise<Message> {
  return { ...defaultMessage(), ...updates, id: messageId, updated_at: now() }
}

export async function deleteMessagesIncludingAndAfter(
  userId: string,
  chatId: string,
  sequenceNumber: number
): Promise<void> {}

export async function getMessagesByChatId(chatId: string): Promise<Message[]> {
  return []
}

// ── Models ─────────────────────────────────────────────────────────────────

export async function getModelById(modelId: string): Promise<Model | null> {
  return null
}

export async function getModelWorkspacesByWorkspaceId(
  workspaceId: string
): Promise<{ models: Model[] }> {
  return { models: [] }
}

// ── Files / collections / assistants (stubs — out of scope) ───────────────

export async function createChatFiles(_data: any[]): Promise<any[]> {
  return []
}

export async function createMessageFileItems(_data: any[]): Promise<any[]> {
  return []
}

export async function uploadMessageImage(
  _path: string,
  _image: File
): Promise<string> {
  return ""
}

export async function getAssistantCollectionsByAssistantId(
  _assistantId: string
): Promise<{ collections: any[] }> {
  return { collections: [] }
}

export async function getAssistantFilesByAssistantId(
  _assistantId: string
): Promise<{ files: any[] }> {
  return { files: [] }
}

export async function getAssistantToolsByAssistantId(
  _assistantId: string
): Promise<{ tools: any[] }> {
  return { tools: [] }
}

export async function getCollectionFilesByCollectionId(
  _collectionId: string
): Promise<{ files: any[] }> {
  return { files: [] }
}

// ── Folders ────────────────────────────────────────────────────────────────

export async function createFolder(folder: Partial<Folder>): Promise<Folder> {
  return { ...defaultFolder(), ...folder, created_at: now() }
}

export async function updateFolder(
  folderId: string,
  updates: Partial<Folder>
): Promise<Folder> {
  return { ...defaultFolder(), ...updates, id: folderId, updated_at: now() }
}

export async function deleteFolder(folderId: string): Promise<void> {}

// ── Prompts ────────────────────────────────────────────────────────────────

export async function createPrompt(prompt: Partial<Prompt>): Promise<Prompt> {
  return { ...defaultPrompt(), ...prompt, created_at: now() }
}

export async function updatePrompt(
  promptId: string,
  updates: Partial<Prompt>
): Promise<Prompt> {
  return { ...defaultPrompt(), ...updates, id: promptId, updated_at: now() }
}

export async function deletePrompt(promptId: string): Promise<void> {}

// ── Default objects ────────────────────────────────────────────────────────

function defaultChat(): Chat {
  return {
    id: uuidv4(),
    user_id: "local",
    workspace_id: "local",
    assistant_id: null,
    title: "New Chat",
    name: "New Chat",
    model: "",
    prompt: "",
    temperature: 0.5,
    context_length: 4096,
    include_profile_context: false,
    include_workspace_instructions: false,
    embeddings_provider: "openai",
    created_at: now(),
    updated_at: null,
    sharing: "private",
    folder_id: null,
    last_shared_message_id: null,
    image_paths: []
  }
}

function defaultMessage(): Message {
  return {
    id: uuidv4(),
    chat_id: "",
    user_id: "local",
    assistant_id: null,
    role: "user",
    content: "",
    model: "",
    sequence_number: 0,
    image_paths: [],
    created_at: now(),
    updated_at: null
  }
}

function defaultFolder(): Folder {
  return {
    id: uuidv4(),
    user_id: "local",
    workspace_id: "local",
    name: "",
    description: "",
    type: "chats",
    created_at: now(),
    updated_at: null
  }
}

function defaultPrompt(): Prompt {
  return {
    id: uuidv4(),
    user_id: "local",
    workspace_id: null,
    name: "",
    content: "",
    created_at: now(),
    updated_at: null,
    sharing: "private",
    folder_id: null
  }
}
