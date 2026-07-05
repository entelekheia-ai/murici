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

import { getDB, AgentBundleRecord } from "./schema"
import { UnpackPayload } from "@/types/electron"

export async function getAgentBundle(
  conversationId: string
): Promise<AgentBundleRecord | null> {
  const db = await getDB()
  return (await db.get("agentBundles", conversationId)) ?? null
}

export async function getAllAgentBundles(): Promise<AgentBundleRecord[]> {
  const db = await getDB()
  return db.getAll("agentBundles")
}

export async function saveAgentBundle(
  conversationId: string,
  payload: UnpackPayload
): Promise<void> {
  const db = await getDB()
  const record: AgentBundleRecord = {
    conversationId,
    aboutme: payload.aboutme,
    behaviorText: payload.behaviorText,
    descriptionText: payload.descriptionText ?? "",
    knowledge: payload.knowledge ?? [],
    guides: payload.guides ?? [],
    behaviors: payload.behaviors ?? [],
    updatedAt: new Date().toISOString()
  }
  await db.put("agentBundles", record)
}

export async function deleteAgentBundle(conversationId: string): Promise<void> {
  const db = await getDB()
  await db.delete("agentBundles", conversationId)
}
