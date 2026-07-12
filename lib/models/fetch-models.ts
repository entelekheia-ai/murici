/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { Tables } from "@/types/database"
import { LLM, OpenRouterLLM } from "@/types"
import { toast } from "sonner"
import { LLM_LIST_MAP } from "./llm/llm-list"
import { buildApiKeys } from "./build-api-keys"

// Providers with a live list-models endpoint we can discover from — see
// app/api/models/discover-remote/route.ts. Perplexity has no public
// list-models endpoint, and Azure exposes deployments (configured manually
// in profile settings), not a model catalog — both stay on the static list.
const REMOTE_DISCOVERABLE_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "mistral",
  "groq"
] as const

export const fetchHostedModels = async (profile: Tables<"profiles">) => {
  try {
    // Check which providers have keys set via env vars (server-side fallback)
    let envKeyMap: Record<string, boolean> = {}
    try {
      const response = await fetch("/api/keys")
      if (response.ok) {
        const data = await response.json()
        envKeyMap = data.isUsingEnvKeyMap ?? {}
      }
    } catch {
      // /api/keys unavailable — rely on profile keys only
    }

    const modelsToAdd: LLM[] = []

    // Perplexity always stays static; Azure stays static only while enabled
    // (its "openai_api_key"-shaped remote discovery makes no sense — Azure
    // deployments are configured by hand, not discovered).
    const staticProviders = profile.use_azure_openai
      ? ["perplexity", "azure"]
      : ["perplexity"]

    for (const provider of staticProviders) {
      const providerKey = (
        provider === "azure" ? "azure_openai_api_key" : `${provider}_api_key`
      ) as keyof typeof profile

      if (profile?.[providerKey] || envKeyMap[provider]) {
        const models = LLM_LIST_MAP[provider]

        if (Array.isArray(models)) {
          modelsToAdd.push(...models)
        }
      }
    }

    // Azure active means "openai" is served by the static Azure branch above,
    // not live OpenAI discovery.
    if (!profile.use_azure_openai) {
      const apiKeys = buildApiKeys(profile)
      const hasAnyRemoteKey = REMOTE_DISCOVERABLE_PROVIDERS.some(
        provider => (apiKeys as Record<string, string | undefined>)[provider] || envKeyMap[provider]
      )

      if (hasAnyRemoteKey) {
        try {
          const response = await fetch("/api/models/discover-remote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ apiKeys })
          })

          if (response.ok) {
            const { results } = await response.json()

            for (const [provider, result] of Object.entries<{
              status: "ok" | "auth_error" | "error"
              models?: LLM[]
            }>(results ?? {})) {
              if (result.status === "ok") {
                modelsToAdd.push(...(result.models ?? []))
              } else if (result.status === "auth_error") {
                toast.error(
                  `${provider} API key inválida. Verifique em Configurações de perfil.`
                )
              } else {
                // Transient failure (network/timeout/5xx/429) with a
                // seemingly-valid key: surface a non-selectable placeholder
                // instead of silently falling back to a stale model list.
                modelsToAdd.push({
                  modelId: `__error__:${provider}`,
                  modelName: "__discovery_error__",
                  provider: provider as LLM["provider"],
                  hostedId: "",
                  platformLink: "",
                  imageInput: false,
                  disabled: true
                })
              }
            }
          }
        } catch (error) {
          console.warn("Error discovering remote models: " + error)
        }
      }
    }

    return {
      envKeyMap,
      hostedModels: modelsToAdd
    }
  } catch (error) {
    console.warn("Error fetching hosted models: " + error)
  }
}

export const fetchLocalModels = async (): Promise<LLM[]> => {
  try {
    const response = await fetch("/api/models/discover")
    if (!response.ok) return []
    return await response.json()
  } catch {
    return []
  }
}

export const fetchOpenRouterModels = async () => {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models")

    if (!response.ok) {
      throw new Error(`OpenRouter server is not responding.`)
    }

    const { data } = await response.json()

    const openRouterModels = data.map(
      (model: {
        id: string
        name: string
        context_length: number
      }): OpenRouterLLM => ({
        modelId: model.id,
        modelName: model.id,
        provider: "openrouter",
        hostedId: model.name,
        platformLink: "https://openrouter.dev",
        imageInput: false,
        maxContext: model.context_length
      })
    )

    return openRouterModels
  } catch (error) {
    console.error("Error fetching Open Router models: " + error)
    toast.error("Error fetching Open Router models: " + error)
  }
}
