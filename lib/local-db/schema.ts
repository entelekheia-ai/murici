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
