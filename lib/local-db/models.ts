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

import { getDB, CustomModelRecord } from "./schema"

export async function getAllCustomModels(): Promise<CustomModelRecord[]> {
  const db = await getDB()
  return db.getAll("customModels")
}

export async function getCustomModelById(
  id: string
): Promise<CustomModelRecord | null> {
  const db = await getDB()
  return (await db.get("customModels", id)) ?? null
}

export async function createCustomModel(
  data: Partial<CustomModelRecord>
): Promise<CustomModelRecord> {
  const db = await getDB()
  const record: CustomModelRecord = {
    id: data.id ?? crypto.randomUUID(),
    name: data.name ?? "",
    apiKey: data.apiKey ?? "",
    baseUrl: data.baseUrl ?? "",
    modelId: data.modelId ?? "",
    contextLength: data.contextLength ?? 4096,
    createdAt: new Date().toISOString()
  }
  await db.put("customModels", record)
  return record
}

export async function updateCustomModel(
  id: string,
  updates: Partial<CustomModelRecord>
): Promise<CustomModelRecord> {
  const db = await getDB()
  const existing = await db.get("customModels", id)
  const record: CustomModelRecord = {
    ...(existing ?? {
      id,
      name: "",
      apiKey: "",
      baseUrl: "",
      modelId: "",
      contextLength: 4096,
      createdAt: new Date().toISOString()
    }),
    ...updates,
    id
  }
  await db.put("customModels", record)
  return record
}

export async function deleteCustomModel(id: string): Promise<void> {
  const db = await getDB()
  await db.delete("customModels", id)
}
