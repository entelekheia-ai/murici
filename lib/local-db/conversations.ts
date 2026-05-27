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
  const record: ConversationRecord = {
    ...(existing ?? {
      id,
      title: "New Chat",
      model: "",
      provider: "",
      temperature: 0.5,
      contextLength: 4096,
      createdAt: new Date().toISOString()
    }),
    ...updates,
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
}
