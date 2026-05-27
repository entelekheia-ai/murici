import {
  getMessagesByConversationId,
  createMessages as dbCreateMessages,
  updateMessage as dbUpdateMessage,
  deleteMessagesIncludingAndAfter as dbDeleteMessages
} from "@/lib/local-db/messages"
import { Message } from "@/types/database"
import { v4 as uuidv4 } from "uuid"

function toMessage(m: any): Message {
  return {
    id: m.id,
    chat_id: m.conversationId ?? "",
    user_id: "local",
    assistant_id: null,
    role: m.role ?? "user",
    content: m.content ?? "",
    model: m.model ?? "",
    sequence_number: m.sequenceNumber ?? 0,
    image_paths: [],
    created_at: m.createdAt ?? new Date().toISOString(),
    updated_at: null
  }
}

export async function getMessagesByChatId(chatId: string): Promise<Message[]> {
  const msgs = await getMessagesByConversationId(chatId)
  return msgs.map(toMessage)
}

export async function createMessages(
  messages: Partial<Message>[]
): Promise<Message[]> {
  const records = await dbCreateMessages(
    messages.map(m => ({
      id: m.id ?? uuidv4(),
      conversationId: m.chat_id ?? "",
      role: m.role ?? "user",
      content: m.content ?? "",
      model: m.model ?? "",
      sequenceNumber: m.sequence_number ?? 0
    }))
  )
  return records.map(toMessage)
}

export async function updateMessage(
  messageId: string,
  updates: Partial<Message>
): Promise<Message> {
  const record = await dbUpdateMessage(messageId, {
    content: updates.content,
    role: updates.role,
    model: updates.model,
    sequenceNumber: updates.sequence_number
  })
  return toMessage(record)
}

export async function deleteMessagesIncludingAndAfter(
  userId: string,
  chatId: string,
  sequenceNumber: number
): Promise<void> {
  await dbDeleteMessages(chatId, sequenceNumber)
}
