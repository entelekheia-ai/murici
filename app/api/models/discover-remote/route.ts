/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { getProfileFromBody } from "@/lib/server/server-chat-helpers"
import { LLM } from "@/types"
import { logger } from "@/lib/logger"

export const runtime = "edge"

const DISCOVERY_TIMEOUT_MS = 5000
const CACHE_TTL_MS = 10 * 60 * 1000

type RemoteProvider = "openai" | "anthropic" | "google" | "mistral" | "groq"

type ProviderResult =
  | { status: "ok"; models: LLM[] }
  | { status: "auth_error" } // upstream 401/403 — key is present but rejected
  | { status: "error" } // network/timeout/5xx/429 — transient, not the key's fault

// Module-level: this route runs in a long-lived process (Electron-embedded
// Next server), not a serverless edge deployment, so an in-memory cache
// actually persists between requests instead of resetting per invocation.
const cache = new Map<string, { expires: number; result: ProviderResult }>()

function getCached(cacheKey: string): ProviderResult | null {
  const entry = cache.get(cacheKey)
  if (!entry) return null
  if (Date.now() > entry.expires) {
    cache.delete(cacheKey)
    return null
  }
  return entry.result
}

function setCached(cacheKey: string, result: ProviderResult) {
  cache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, result })
}

async function timedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" })
  } finally {
    clearTimeout(timer)
  }
}

function statusFromResponse(res: Response): "auth_error" | "error" {
  return res.status === 401 || res.status === 403 ? "auth_error" : "error"
}

function toLLM(provider: RemoteProvider, id: string): LLM {
  return {
    modelId: id,
    modelName: id,
    provider,
    hostedId: id,
    platformLink: "",
    imageInput: false
  }
}

// OpenAI's and Groq's /v1/models both return the full account catalog,
// including non-chat entries (embeddings, whisper, tts, dall-e, moderation,
// legacy completion snapshots) that would just error out if picked in the
// chat model dropdown.
const NON_CHAT_OPENAI_MODEL = /embedding|whisper|tts|dall-e|moderation|davinci-002|babbage-002/i

async function discoverOpenAICompat(
  provider: "openai" | "groq",
  baseUrl: string,
  apiKey: string
): Promise<ProviderResult> {
  try {
    const res = await timedFetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    if (!res.ok) return { status: statusFromResponse(res) }

    const json = await res.json()
    const items: { id: string }[] = json?.data ?? []
    const models = items
      .filter(item => !NON_CHAT_OPENAI_MODEL.test(item.id))
      .map(item => toLLM(provider, item.id))

    return { status: "ok", models }
  } catch (error: any) {
    logger.warn("remote model discovery failed", { provider, error: error?.message })
    return { status: "error" }
  }
}

async function discoverAnthropic(apiKey: string): Promise<ProviderResult> {
  try {
    const res = await timedFetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      }
    })
    if (!res.ok) return { status: statusFromResponse(res) }

    const json = await res.json()
    const items: { id: string }[] = json?.data ?? []
    return { status: "ok", models: items.map(item => toLLM("anthropic", item.id)) }
  } catch (error: any) {
    logger.warn("remote model discovery failed", { provider: "anthropic", error: error?.message })
    return { status: "error" }
  }
}

async function discoverGoogle(apiKey: string): Promise<ProviderResult> {
  try {
    const res = await timedFetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    )
    const json = await res.json().catch(() => null)

    if (!res.ok) {
      // Unlike OpenAI/Anthropic/Mistral/Groq, Google returns 400
      // INVALID_ARGUMENT (not 401/403) for a bad key, with
      // reason: "API_KEY_INVALID" in the error details — a generic
      // status-code check misclassifies this as a transient error instead
      // of a bad key.
      const reason = json?.error?.details?.find(
        (d: any) => d.reason === "API_KEY_INVALID"
      )
      if (reason || res.status === 401 || res.status === 403) {
        return { status: "auth_error" }
      }
      return { status: "error" }
    }

    const items: { name: string; supportedGenerationMethods?: string[] }[] =
      json?.models ?? []
    // Google's ListModels mixes in embedding/aqa/etc. entries that can't
    // generate chat content at all — without this filter they'd dominate
    // the dropdown.
    const models = items
      .filter(item => item.supportedGenerationMethods?.includes("generateContent"))
      .map(item => toLLM("google", item.name.replace(/^models\//, "")))

    return { status: "ok", models }
  } catch (error: any) {
    logger.warn("remote model discovery failed", { provider: "google", error: error?.message })
    return { status: "error" }
  }
}

async function discoverMistral(apiKey: string): Promise<ProviderResult> {
  try {
    const res = await timedFetch("https://api.mistral.ai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    if (!res.ok) return { status: statusFromResponse(res) }

    const json = await res.json()
    const items: { id: string }[] = json?.data ?? []
    const models = items
      .filter(item => !/embed/i.test(item.id))
      .map(item => toLLM("mistral", item.id))

    return { status: "ok", models }
  } catch (error: any) {
    logger.warn("remote model discovery failed", { provider: "mistral", error: error?.message })
    return { status: "error" }
  }
}

async function discoverProvider(
  provider: RemoteProvider,
  apiKey: string
): Promise<ProviderResult> {
  const cacheKey = `${provider}:${apiKey}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  let result: ProviderResult
  switch (provider) {
    case "openai":
      result = await discoverOpenAICompat("openai", "https://api.openai.com/v1", apiKey)
      break
    case "groq":
      result = await discoverOpenAICompat("groq", "https://api.groq.com/openai/v1", apiKey)
      break
    case "anthropic":
      result = await discoverAnthropic(apiKey)
      break
    case "google":
      result = await discoverGoogle(apiKey)
      break
    case "mistral":
      result = await discoverMistral(apiKey)
      break
  }

  setCached(cacheKey, result)
  return result
}

export async function POST(request: Request) {
  const json = await request.json()
  const profile = getProfileFromBody(json)

  const providerKeys: Record<RemoteProvider, string | null> = {
    openai: profile.openai_api_key,
    anthropic: profile.anthropic_api_key,
    google: profile.google_gemini_api_key,
    mistral: profile.mistral_api_key,
    groq: profile.groq_api_key
  }

  const entries = (Object.entries(providerKeys) as [RemoteProvider, string | null][]).filter(
    (entry): entry is [RemoteProvider, string] => !!entry[1]
  )

  const settled = await Promise.allSettled(
    entries.map(([provider, apiKey]) => discoverProvider(provider, apiKey))
  )

  const results: Partial<Record<RemoteProvider, ProviderResult>> = {}
  entries.forEach(([provider], i) => {
    const outcome = settled[i]
    results[provider] = outcome.status === "fulfilled" ? outcome.value : { status: "error" }
  })

  return Response.json({ results })
}
