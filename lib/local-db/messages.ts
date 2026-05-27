import { v4 as uuidv4 } from "uuid"
import { getDB, MessageRecord } from "./schema"

export async function getMessagesByConversationId(
  conversationId: string
): Promise<MessageRecord[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex(
    "messages",
    "by_conversation",
    conversationId
  )
  return all.sort((a, b) => a.sequenceNumber - b.sequenceNumber)
}

export async function createMessage(
  data: Partial<MessageRecord>
): Promise<MessageRecord> {
  const db = await getDB()
  const record: MessageRecord = {
    id: data.id ?? uuidv4(),
    conversationId: data.conversationId ?? "",
    role: data.role ?? "user",
    content: data.content ?? "",
    model: data.model ?? "",
    sequenceNumber: data.sequenceNumber ?? 0,
    createdAt: new Date().toISOString()
  }
  await db.put("messages", record)
  return record
}

export async function createMessages(
  messages: Partial<MessageRecord>[]
): Promise<MessageRecord[]> {
  return Promise.all(messages.map(m => createMessage(m)))
}

export async function updateMessage(
  id: string,
  updates: Partial<MessageRecord>
): Promise<MessageRecord> {
  const db = await getDB()
  const existing = await db.get("messages", id)
  const record: MessageRecord = {
    ...(existing ?? {
      id,
      conversationId: "",
      role: "user" as const,
      content: "",
      model: "",
      sequenceNumber: 0,
      createdAt: new Date().toISOString()
    }),
    ...updates,
    id
  }
  await db.put("messages", record)
  return record
}

export async function deleteMessagesIncludingAndAfter(
  conversationId: string,
  sequenceNumber: number
): Promise<void> {
  const db = await getDB()
  const all = await db.getAllFromIndex(
    "messages",
    "by_conversation",
    conversationId
  )
  const toDelete = all.filter(m => m.sequenceNumber >= sequenceNumber)
  const tx = db.transaction("messages", "readwrite")
  await Promise.all(toDelete.map(m => tx.store.delete(m.id)))
  await tx.done
}
