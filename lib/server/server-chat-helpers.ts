/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { VALID_ENV_KEYS } from "@/types/valid-keys"

export interface ServerProfile {
  openai_api_key: string | null
  anthropic_api_key: string | null
  google_gemini_api_key: string | null
  mistral_api_key: string | null
  groq_api_key: string | null
  perplexity_api_key: string | null
  azure_openai_api_key: string | null
  openrouter_api_key: string | null
  openai_organization_id: string | null
  azure_openai_endpoint: string | null
  azure_openai_35_turbo_id: string | null
  azure_openai_45_vision_id: string | null
  azure_openai_45_turbo_id: string | null
  azure_openai_embeddings_id: string | null
  use_azure_openai: boolean
  profile_context: string
  username: string
  id: string
  user_id: string
}

// Builds a profile from the request body's apiKeys field, with env vars as fallback.
export function getProfileFromBody(body: Record<string, any>): ServerProfile {
  const keys = body.apiKeys ?? {}

  const profile: ServerProfile = {
    openai_api_key:
      keys.openai ?? process.env[VALID_ENV_KEYS.OPENAI_API_KEY] ?? null,
    anthropic_api_key:
      keys.anthropic ?? process.env[VALID_ENV_KEYS.ANTHROPIC_API_KEY] ?? null,
    google_gemini_api_key:
      keys.google ?? process.env[VALID_ENV_KEYS.GOOGLE_GEMINI_API_KEY] ?? null,
    mistral_api_key:
      keys.mistral ?? process.env[VALID_ENV_KEYS.MISTRAL_API_KEY] ?? null,
    groq_api_key: keys.groq ?? process.env[VALID_ENV_KEYS.GROQ_API_KEY] ?? null,
    perplexity_api_key:
      keys.perplexity ?? process.env[VALID_ENV_KEYS.PERPLEXITY_API_KEY] ?? null,
    azure_openai_api_key:
      keys.azure ?? process.env[VALID_ENV_KEYS.AZURE_OPENAI_API_KEY] ?? null,
    openrouter_api_key:
      keys.openrouter ?? process.env[VALID_ENV_KEYS.OPENROUTER_API_KEY] ?? null,
    openai_organization_id:
      keys.openaiOrgId ??
      process.env[VALID_ENV_KEYS.OPENAI_ORGANIZATION_ID] ??
      null,
    azure_openai_endpoint:
      keys.azureEndpoint ??
      process.env[VALID_ENV_KEYS.AZURE_OPENAI_ENDPOINT] ??
      null,
    azure_openai_35_turbo_id:
      keys.azure35TurboId ??
      process.env[VALID_ENV_KEYS.AZURE_GPT_35_TURBO_NAME] ??
      null,
    azure_openai_45_vision_id:
      keys.azure45VisionId ??
      process.env[VALID_ENV_KEYS.AZURE_GPT_45_VISION_NAME] ??
      null,
    azure_openai_45_turbo_id:
      keys.azure45TurboId ??
      process.env[VALID_ENV_KEYS.AZURE_GPT_45_TURBO_NAME] ??
      null,
    azure_openai_embeddings_id:
      keys.azureEmbeddingsId ??
      process.env[VALID_ENV_KEYS.AZURE_EMBEDDINGS_NAME] ??
      null,
    use_azure_openai: keys.useAzure ?? false,
    profile_context: "",
    username: "local",
    id: "local",
    user_id: "local"
  }

  return profile
}

export function checkApiKey(apiKey: string | null, keyName: string) {
  if (apiKey === null || apiKey === "") {
    throw new Error(`${keyName} API Key not found`)
  }
}
