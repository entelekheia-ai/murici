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

import { getDB, RecentAgentRecord } from "./schema"
import { AgentAboutme } from "@/types/electron"

export async function getAllRecentAgents(): Promise<RecentAgentRecord[]> {
  const db = await getDB()
  return db.getAllFromIndex("recentAgents", "by_opened")
}

export async function upsertRecentAgent(entry: {
  filePath: string | null
  aboutme: AgentAboutme
}): Promise<RecentAgentRecord> {
  const db = await getDB()
  const dedupeKey = entry.filePath || `agentid:${entry.aboutme.id}`
  const existing = await db.getFromIndex(
    "recentAgents",
    "by_dedupe_key",
    dedupeKey
  )
  const record: RecentAgentRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    dedupeKey,
    filePath: entry.filePath,
    aboutme: entry.aboutme,
    openedAt: new Date().toISOString()
  }
  await db.put("recentAgents", record)
  return record
}

export async function removeRecentAgent(id: string): Promise<void> {
  const db = await getDB()
  await db.delete("recentAgents", id)
}
