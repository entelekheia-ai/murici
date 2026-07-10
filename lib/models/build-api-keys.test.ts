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

import { buildApiKeys } from "./build-api-keys"
import { Tables } from "@/types/database"

function makeProfile(
  overrides: Partial<Tables<"profiles">> = {}
): Tables<"profiles"> {
  return {
    id: "local",
    user_id: "local",
    username: "local",
    display_name: "",
    bio: "",
    profile_context: "",
    has_onboarded: true,
    image_url: "",
    image_path: "",
    use_azure_openai: false,
    openai_api_key: null,
    anthropic_api_key: null,
    google_gemini_api_key: null,
    mistral_api_key: null,
    groq_api_key: null,
    perplexity_api_key: null,
    azure_openai_api_key: null,
    openrouter_api_key: null,
    openai_organization_id: null,
    azure_openai_endpoint: null,
    azure_openai_35_turbo_id: null,
    azure_openai_45_vision_id: null,
    azure_openai_45_turbo_id: null,
    azure_openai_embeddings_id: null,
    background_model_id: null,
    created_at: new Date().toISOString(),
    updated_at: null,
    ...overrides
  } as Tables<"profiles">
}

describe("buildApiKeys", () => {
  it("returns an empty object when the profile hasn't loaded yet", () => {
    expect(buildApiKeys(null)).toEqual({})
  })

  it("maps every provider key from snake_case profile fields to the camelCase request shape", () => {
    const profile = makeProfile({
      openai_api_key: "sk-openai",
      anthropic_api_key: "sk-anthropic",
      google_gemini_api_key: "sk-google",
      mistral_api_key: "sk-mistral",
      groq_api_key: "sk-groq",
      perplexity_api_key: "sk-perplexity",
      azure_openai_api_key: "sk-azure",
      openrouter_api_key: "sk-openrouter"
    })

    expect(buildApiKeys(profile)).toMatchObject({
      openai: "sk-openai",
      anthropic: "sk-anthropic",
      google: "sk-google",
      mistral: "sk-mistral",
      groq: "sk-groq",
      perplexity: "sk-perplexity",
      azure: "sk-azure",
      openrouter: "sk-openrouter"
    })
  })

  it("maps the Azure deployment fields", () => {
    const profile = makeProfile({
      openai_organization_id: "org-1",
      azure_openai_endpoint: "https://x.openai.azure.com",
      azure_openai_35_turbo_id: "gpt-35",
      azure_openai_45_turbo_id: "gpt-45",
      azure_openai_45_vision_id: "gpt-45-vision",
      azure_openai_embeddings_id: "embeddings"
    })

    expect(buildApiKeys(profile)).toMatchObject({
      openaiOrgId: "org-1",
      azureEndpoint: "https://x.openai.azure.com",
      azure35TurboId: "gpt-35",
      azure45TurboId: "gpt-45",
      azure45VisionId: "gpt-45-vision",
      azureEmbeddingsId: "embeddings"
    })
  })

  it("turns null fields into undefined instead of forwarding null", () => {
    const result = buildApiKeys(makeProfile())
    expect(result.google).toBeUndefined()
    expect(result.openai).toBeUndefined()
  })

  it("passes useAzure through as a plain boolean", () => {
    expect(buildApiKeys(makeProfile({ use_azure_openai: true })).useAzure).toBe(
      true
    )
    expect(
      buildApiKeys(makeProfile({ use_azure_openai: false })).useAzure
    ).toBe(false)
  })
})
