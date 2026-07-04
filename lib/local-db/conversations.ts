/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { v4 as uuidv4 } from "uuid"
import { getDB, ConversationRecord } from "./schema"

export async function getAllConversations(): Promise<ConversationRecord[]> {
  const db = await getDB()
  return db.getAllFromIndex("conversations", "by_created")
}

export async function getConversationById(
  id: string
): Promise<ConversationRecord | null> {
  const db = await getDB()
  return (await db.get("conversations", id)) ?? null
}

export async function createConversation(
  data: Partial<ConversationRecord>
): Promise<ConversationRecord> {
  const db = await getDB()
  const record: ConversationRecord = {
    id: data.id ?? uuidv4(),
    title: data.title ?? "New Chat",
    model: data.model ?? "",
    provider: data.provider ?? "",
    temperature: data.temperature ?? 0.5,
    contextLength: data.contextLength ?? 4096,
    assistantId: data.assistantId ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: null
  }
  await db.put("conversations", record)
  return record
}

export async function updateConversation(
  id: string,
  updates: Partial<ConversationRecord>
): Promise<ConversationRecord> {
  const db = await getDB()
  const existing = await db.get("conversations", id)
  // Strip explicit `undefined`s so a caller that only intends to touch one
  // field can't accidentally null out the rest via object spread.
  const definedUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  ) as Partial<ConversationRecord>
  const record: ConversationRecord = {
    ...(existing ?? {
      id,
      title: "New Chat",
      model: "",
      provider: "",
      temperature: 0.5,
      contextLength: 4096,
      assistantId: null,
      createdAt: new Date().toISOString()
    }),
    ...definedUpdates,
    id,
    updatedAt: new Date().toISOString()
  }
  await db.put("conversations", record)
  return record
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDB()
  await db.delete("conversations", id)
  // Delete associated messages
  const msgs = await db.getAllFromIndex("messages", "by_conversation", id)
  const tx = db.transaction("messages", "readwrite")
  await Promise.all(msgs.map(m => tx.store.delete(m.id)))
  await tx.done
  await db.delete("agentBundles", id)
}
