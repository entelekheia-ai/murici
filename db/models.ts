/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import {
  getAllCustomModels,
  getCustomModelById,
  createCustomModel,
  updateCustomModel,
  deleteCustomModel
} from "@/lib/local-db/models"
import { Model } from "@/types/database"

function toModel(m: any): Model {
  return {
    id: m.id,
    user_id: "local",
    workspace_id: "local",
    name: m.name ?? "",
    description: "",
    api_key: m.apiKey ?? "",
    base_url: m.baseUrl ?? "",
    model_id: m.modelId ?? "",
    context_length: m.contextLength ?? 4096,
    created_at: m.createdAt ?? new Date().toISOString(),
    updated_at: null,
    sharing: "private",
    folder_id: null
  }
}

export async function getModelById(id: string): Promise<Model | null> {
  const m = await getCustomModelById(id)
  return m ? toModel(m) : null
}

export async function getModelWorkspacesByWorkspaceId(
  workspaceId: string
): Promise<{ models: Model[] }> {
  const all = await getAllCustomModels()
  return { models: all.map(toModel) }
}

export async function getModelWorkspacesByModelId(
  id: string
): Promise<{ workspaces: any[] }> {
  return { workspaces: [] }
}

export async function createModel(data: Partial<Model>): Promise<Model> {
  const m = await createCustomModel({
    id: data.id,
    name: data.name,
    apiKey: data.api_key,
    baseUrl: data.base_url,
    modelId: data.model_id,
    contextLength: data.context_length
  })
  return toModel(m)
}

export async function updateModel(
  id: string,
  data: Partial<Model>
): Promise<Model> {
  const m = await updateCustomModel(id, {
    name: data.name,
    apiKey: data.api_key,
    baseUrl: data.base_url,
    modelId: data.model_id,
    contextLength: data.context_length
  })
  return toModel(m)
}

export async function deleteModel(id: string): Promise<void> {
  await deleteCustomModel(id)
}

export async function createModelWorkspaces(data: any[]): Promise<any[]> {
  return []
}

export async function deleteModelWorkspace(id: string): Promise<void> {}
