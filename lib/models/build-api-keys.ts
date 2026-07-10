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

import { Tables } from "@/types/database"

/**
 * Maps the profile's stored provider keys into the camelCase shape
 * app/api/chat/*\/route.ts expects on `body.apiKeys` (via getProfileFromBody
 * in lib/server/server-chat-helpers.ts). Without this, remote models
 * (Gemini, GPT, etc.) fail with "API Key not found" even after the user
 * saves a key in Settings, because the request body never carries it.
 */
export function buildApiKeys(profile: Tables<"profiles"> | null) {
  if (!profile) return {}

  return {
    openai: profile.openai_api_key ?? undefined,
    anthropic: profile.anthropic_api_key ?? undefined,
    google: profile.google_gemini_api_key ?? undefined,
    mistral: profile.mistral_api_key ?? undefined,
    groq: profile.groq_api_key ?? undefined,
    perplexity: profile.perplexity_api_key ?? undefined,
    azure: profile.azure_openai_api_key ?? undefined,
    openrouter: profile.openrouter_api_key ?? undefined,
    openaiOrgId: profile.openai_organization_id ?? undefined,
    azureEndpoint: profile.azure_openai_endpoint ?? undefined,
    azure35TurboId: profile.azure_openai_35_turbo_id ?? undefined,
    azure45TurboId: profile.azure_openai_45_turbo_id ?? undefined,
    azure45VisionId: profile.azure_openai_45_vision_id ?? undefined,
    azureEmbeddingsId: profile.azure_openai_embeddings_id ?? undefined,
    useAzure: profile.use_azure_openai
  }
}
