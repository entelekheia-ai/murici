import { openDB, DBSchema, IDBPDatabase } from "idb"

export interface ConversationRecord {
  id: string
  title: string
  model: string
  provider: string
  temperature: number
  contextLength: number
  createdAt: string
  updatedAt: string | null
}

export interface MessageRecord {
  id: string
  conversationId: string
  role: "user" | "assistant" | "system" | "tool"
  content: string
  model: string
  sequenceNumber: number
  createdAt: string
}

export interface CustomModelRecord {
  id: string
  name: string
  apiKey: string
  baseUrl: string
  modelId: string
  contextLength: number
  createdAt: string
}

export interface SettingRecord {
  key: string
  value: string
}

interface LocalDB extends DBSchema {
  conversations: {
    key: string
    value: ConversationRecord
    indexes: { by_created: string }
  }
  messages: {
    key: string
    value: MessageRecord
    indexes: { by_conversation: string; by_sequence: [string, number] }
  }
  customModels: {
    key: string
    value: CustomModelRecord
  }
  settings: {
    key: string
    value: SettingRecord
  }
}

let dbPromise: Promise<IDBPDatabase<LocalDB>> | null = null

export function getDB(): Promise<IDBPDatabase<LocalDB>> {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is only available in the browser")
  }
  if (!dbPromise) {
    dbPromise = openDB<LocalDB>("entelekheia", 1, {
      upgrade(db) {
        const conv = db.createObjectStore("conversations", { keyPath: "id" })
        conv.createIndex("by_created", "createdAt")

        const msg = db.createObjectStore("messages", { keyPath: "id" })
        msg.createIndex("by_conversation", "conversationId")
        msg.createIndex("by_sequence", ["conversationId", "sequenceNumber"])

        db.createObjectStore("customModels", { keyPath: "id" })
        db.createObjectStore("settings", { keyPath: "key" })
      }
    })
  }
  return dbPromise
}
