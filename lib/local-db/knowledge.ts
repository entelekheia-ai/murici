/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import { KnowledgeRecord } from "@/types/knowledge"
import { getDB } from "./schema"

export async function createKnowledgeRecord(
  data: KnowledgeRecord
): Promise<KnowledgeRecord> {
  const db = await getDB()
  await db.put("knowledge", data)
  return data
}

export async function updateKnowledgeRecord(
  id: string,
  updates: Partial<KnowledgeRecord>
): Promise<KnowledgeRecord> {
  const db = await getDB()
  const existing = await db.get("knowledge", id)
  if (!existing) throw new Error(`KnowledgeRecord not found: ${id}`)
  const updated = { ...existing, ...updates }
  await db.put("knowledge", updated)
  return updated
}

export async function getKnowledgeByConversationId(
  conversationId: string
): Promise<KnowledgeRecord[]> {
  const db = await getDB()
  return db.getAllFromIndex("knowledge", "by_conversation", conversationId)
}

export async function getAllKnowledgeRecords(): Promise<KnowledgeRecord[]> {
  const db = await getDB()
  return db.getAll("knowledge")
}
