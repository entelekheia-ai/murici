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
