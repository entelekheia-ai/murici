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

export type CustomModelPayload = {
  model_id: string
  base_url: string
  api_key: string
}

/**
 * Resolves the `customModel` payload sent to app/api/chat/custom/route.ts,
 * checking both places a non-cloud model can live: the DB-backed "custom"
 * bucket (context.models, manually configured base_url/api_key) and the
 * ephemeral auto-discovered "local" bucket (context.availableLocalModels —
 * Ollama/LM Studio/oMLX/etc., camelCase baseUrl/apiKey from the discover
 * route). Missing the second bucket was the root cause of a real "Custom
 * model base_url is required" failure.
 */
export function resolveCustomModel(
  models: Array<{ model_id: string; [key: string]: any }>,
  availableLocalModels: Array<{ modelId: string; baseUrl?: string; apiKey?: string }>,
  selectedModelId: string | undefined
): CustomModelPayload | undefined {
  const dbCustomModel = models.find(m => m.model_id === selectedModelId)
  if (dbCustomModel) return dbCustomModel as CustomModelPayload

  const localModel = availableLocalModels.find(m => m.modelId === selectedModelId)
  if (!localModel) return undefined

  return {
    model_id: localModel.modelId,
    base_url: localModel.baseUrl || "",
    api_key: localModel.apiKey || ""
  }
}
