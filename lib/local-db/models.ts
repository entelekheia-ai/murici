import { v4 as uuidv4 } from "uuid"
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
    id: data.id ?? uuidv4(),
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
