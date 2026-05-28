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

import { getDB } from "./schema"

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDB()
  const record = await db.get("settings", key)
  return record?.value ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDB()
  await db.put("settings", { key, value })
}

export async function deleteSetting(key: string): Promise<void> {
  const db = await getDB()
  await db.delete("settings", key)
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDB()
  const all = await db.getAll("settings")
  return Object.fromEntries(all.map(r => [r.key, r.value]))
}
