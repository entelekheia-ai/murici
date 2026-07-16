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

import { resolveCustomModel } from "./resolve-custom-model"

describe("resolveCustomModel", () => {
  it("returns the DB-backed custom model when the selected id matches it", () => {
    const models = [
      { model_id: "my-custom", base_url: "https://x/v1", api_key: "k" }
    ]
    const result = resolveCustomModel(models, [], "my-custom")
    expect(result).toBe(models[0])
  })

  it("falls back to the auto-discovered local model, mapping baseUrl/apiKey to base_url/api_key", () => {
    const localModels = [
      {
        modelId: "Qwen3-4B-Instruct-2507-4bit",
        baseUrl: "http://127.0.0.1:8000",
        apiKey: "local"
      }
    ]
    const result = resolveCustomModel(
      [],
      localModels,
      "Qwen3-4B-Instruct-2507-4bit"
    )
    expect(result).toEqual({
      model_id: "Qwen3-4B-Instruct-2507-4bit",
      base_url: "http://127.0.0.1:8000",
      api_key: "local"
    })
  })

  it("prefers the DB-backed custom model when the same id exists in both buckets", () => {
    const models = [
      { model_id: "dup", base_url: "https://db/v1", api_key: "db-key" }
    ]
    const localModels = [
      { modelId: "dup", baseUrl: "http://local", apiKey: "local-key" }
    ]
    const result = resolveCustomModel(models, localModels, "dup")
    expect(result).toBe(models[0])
  })

  it("returns undefined when the selected model isn't in either bucket (e.g. a cloud model)", () => {
    expect(resolveCustomModel([], [], "gpt-4o")).toBeUndefined()
  })

  it("defaults api_key to an empty string when the local model has none", () => {
    const localModels = [
      { modelId: "no-key-model", baseUrl: "http://127.0.0.1:8000" }
    ]
    const result = resolveCustomModel([], localModels, "no-key-model")
    expect(result?.api_key).toBe("")
  })
})
