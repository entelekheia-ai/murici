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

async function timedFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DISCOVERY_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" })
  } finally {
    clearTimeout(timer)
  }
}

function statusFromResponse(res: Response): "auth_error" | "error" {
  return res.status === 401 || res.status === 403 ? "auth_error" : "error"
}

// ── models.dev enrichment ────────────────────────────────────────────
//
// No provider API gives us everything we need to classify current vs
// experimental vs legacy on its own (see project/plans/012 discussion — Google
// in particular has no deprecation/beta signal at all). models.dev is a
// third-party catalog with an explicit `status` ("deprecated"/"beta") and
// dates per model, covering exactly that gap. It's enrichment, never a hard
// dependency: on fetch failure we fall back to the last successfully fetched
// copy (however stale), and only lose the models.dev-derived signal (not the
// whole discovery request) if we've never fetched it successfully at all.

const MODELS_DEV_URL = "https://models.dev/api.json"
const MODELS_DEV_TTL_MS = 72 * 60 * 60 * 1000
const MODELS_DEV_TIMEOUT_MS = 8000

const MODELS_DEV_PROVIDER_ALIASES: Record<RemoteProvider, string[]> = {
  openai: ["openai"],
  anthropic: ["anthropic"],
  google: ["google"],
  mistral: ["mistral", "mistralai"],
  groq: ["groq"]
}

let modelsDevCache: { data: any; fetchedAt: number } | null = null

async function getModelsDevCatalog(): Promise<any | null> {
  if (modelsDevCache && Date.now() - modelsDevCache.fetchedAt < MODELS_DEV_TTL_MS) {
    return modelsDevCache.data
  }
  try {
    const res = await timedFetch(MODELS_DEV_URL, {}, MODELS_DEV_TIMEOUT_MS)
    if (!res.ok) throw new Error(`models.dev responded ${res.status}`)
    const data = await res.json()
    modelsDevCache = { data, fetchedAt: Date.now() }
    return data
  } catch (error: any) {
    logger.warn("models.dev fetch failed, falling back to last cached copy", {
      error: error?.message
    })
    return modelsDevCache?.data ?? null
  }
}

function getModelsDevModels(
  catalog: any,
  provider: RemoteProvider
): Record<string, any> | null {
  if (!catalog) return null
  for (const key of MODELS_DEV_PROVIDER_ALIASES[provider]) {
    if (catalog[key]?.models) return catalog[key].models
  }
  return null
}

// Deliberately exact-id only, no baseId fallback: models.dev has been
// observed keying deprecated status on a family's rolling-alias id (e.g.
// Google's bare "gemini-2.0-flash") separately from its still-listed pinned
// snapshots ("gemini-2.0-flash-001") — falling back to the baseId here would
// cascade that alias's deprecated status onto a snapshot the provider is
// still actively serving (confirmed live: both ids returned 200 from
// Google's own ListModels). Hiding a model that still works contradicts the
// entire point of this discovery route.
function lookupExactModelsDevEntry(
  devModels: Record<string, any> | null,
  id: string
): any {
  if (!devModels) return null
  return devModels[id] ?? null
}

// Experimental/beta detection is lower-stakes than deprecation (worst case
// is a wrong sub-group, not a hidden working model), so this one does fall
// back to the baseId when models.dev only tracks the family, not each id.
function lookupModelsDevEntry(
  devModels: Record<string, any> | null,
  id: string,
  baseId: string
): any {
  if (!devModels) return null
  return devModels[id] ?? devModels[baseId] ?? null
}

// ── Current / Experimental / Legacy classification ──────────────────
//
// - "deprecated" (native signal or models.dev status) is filtered out
//   entirely — an inaccessible model showing up as a non-working "legacy"
//   option is worse than not showing it at all.
// - "legacy" requires a newer sibling with the *same base name* in the same
//   discovery result (e.g. claude-3-5-sonnet-20240620 superseded by
//   claude-3-5-sonnet-20241022, or any dated snapshot superseded by its own
//   rolling alias like gpt-4o). Being old in isolation is never enough.
// - "experimental" is a naming/status signal, independent of the above.

const DATED_SNAPSHOT_SUFFIX = /-(\d{4}-\d{2}-\d{2}|\d{8})$/
const LATEST_SUFFIX = /-latest$/
const EXPERIMENTAL_NAME_PATTERN = /preview|exp(?:erimental)?|alpha|rc\d*/i

// Strips a well-formed trailing dated-snapshot suffix only — deliberately not
// a generic "ends in digits" regex, which would misfire on ids like
// llama3-70b-8192 (context window) or mistral-large-2 (size), not a date.
function baseName(id: string): string {
  return id.replace(DATED_SNAPSHOT_SUFFIX, "")
}

// Google's own docs describe a "{baseModelId}-{version}" naming pattern and
// the ListModels response type documents a `baseModelId` field — but live
// testing found it's simply absent from the actual response (every entry
// came back undefined). The 3-digit pinned-revision suffix it documents
// (e.g. "gemini-2.0-flash-001") is specific enough to Google's naming that a
// dedicated regex is safe here, unlike the generic DATED_SNAPSHOT_SUFFIX.
const GOOGLE_PINNED_REVISION_SUFFIX = /-\d{3}$/

function googleBaseId(id: string, apiBaseModelId?: string): string {
  return apiBaseModelId || id.replace(GOOGLE_PINNED_REVISION_SUFFIX, "")
}

interface RawModel {
  id: string
  baseId: string
  createdAt?: number // epoch ms, when the provider exposes a creation date
  active?: boolean // Groq-only native "still served" signal
}

function classifyModels(
  provider: RemoteProvider,
  items: RawModel[],
  catalog: any
): LLM[] {
  const devModels = getModelsDevModels(catalog, provider)

  // Mistral's /v1/models has been observed returning the same id twice in one
  // response (e.g. "mistral-large-latest" appearing 2x) — not our bug, but
  // rendering it twice in the picker would look broken and collide on
  // ListItem's key={modelId}, so dedupe defensively for every provider.
  const seen = new Set<string>()
  const deduped = items.filter(item => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })

  const alive = deduped.filter(item => {
    if (item.active === false) return false // Groq native signal, wins over models.dev
    const entry = lookupExactModelsDevEntry(devModels, item.id)
    return entry?.status !== "deprecated"
  })

  const groups = new Map<string, RawModel[]>()
  for (const item of alive) {
    const list = groups.get(item.baseId) ?? []
    list.push(item)
    groups.set(item.baseId, list)
  }

  return alive.map(item => {
    const entry = lookupModelsDevEntry(devModels, item.id, item.baseId)
    const isExperimental =
      entry?.status === "beta" || EXPERIMENTAL_NAME_PATTERN.test(item.id)
    // A bare id (equal to its own baseId, e.g. "gpt-4o") or a "-latest" alias
    // is a rolling pointer to whatever is current — it must never be demoted
    // to legacy by a dated sibling's timestamp.
    const isAlias = item.id === item.baseId || LATEST_SUFFIX.test(item.id)

    let tier: LLM["tier"] = "current"
    if (isExperimental) {
      tier = "experimental"
    } else if (!isAlias) {
      const siblings = groups.get(item.baseId) ?? []
      const supersededByAlias = siblings.some(
        s => s !== item && (s.id === item.baseId || LATEST_SUFFIX.test(s.id))
      )
      const supersededByNewerSnapshot = siblings.some(
        s =>
          s !== item &&
          s.createdAt != null &&
          item.createdAt != null &&
          s.createdAt > item.createdAt
      )
      if (supersededByAlias || supersededByNewerSnapshot) tier = "legacy"
    }

    return {
      modelId: item.id,
      modelName: item.id,
      provider,
      hostedId: item.id,
      platformLink: "",
      imageInput: false,
      tier
    }
  })
}

// OpenAI's and Groq's /v1/models both return the full account catalog,
// including non-chat entries (embeddings, whisper, tts, dall-e, moderation,
// legacy completion snapshots) that would just error out if picked in the
// chat model dropdown.
const NON_CHAT_OPENAI_MODEL = /embedding|whisper|tts|dall-e|moderation|davinci-002|babbage-002/i

async function discoverOpenAICompat(
  provider: "openai" | "groq",
  baseUrl: string,
  apiKey: string,
  catalog: any
): Promise<ProviderResult> {
  try {
    const res = await timedFetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    if (!res.ok) return { status: statusFromResponse(res) }

    const json = await res.json()
    // Groq's response additionally includes "created" and "active"; OpenAI's
    // doesn't have "active" at all (stays undefined, never filters anything).
    const items: { id: string; created?: number; active?: boolean }[] = json?.data ?? []
    const raw: RawModel[] = items
      .filter(item => !NON_CHAT_OPENAI_MODEL.test(item.id))
      .map(item => ({
        id: item.id,
        baseId: baseName(item.id),
        createdAt: item.created != null ? item.created * 1000 : undefined,
        active: item.active
      }))

    return { status: "ok", models: classifyModels(provider, raw, catalog) }
  } catch (error: any) {
    logger.warn("remote model discovery failed", { provider, error: error?.message })
    return { status: "error" }
  }
}

async function discoverAnthropic(apiKey: string, catalog: any): Promise<ProviderResult> {
  try {
    const res = await timedFetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      }
    })
    if (!res.ok) return { status: statusFromResponse(res) }

    const json = await res.json()
    const items: { id: string; created_at?: string }[] = json?.data ?? []
    const raw: RawModel[] = items.map(item => ({
      id: item.id,
      baseId: baseName(item.id),
      createdAt: item.created_at ? Date.parse(item.created_at) : undefined
    }))

    return { status: "ok", models: classifyModels("anthropic", raw, catalog) }
  } catch (error: any) {
    logger.warn("remote model discovery failed", { provider: "anthropic", error: error?.message })
    return { status: "error" }
  }
}

async function discoverGoogle(apiKey: string, catalog: any): Promise<ProviderResult> {
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

    const items: {
      name: string
      baseModelId?: string
      supportedGenerationMethods?: string[]
    }[] = json?.models ?? []
    // Google's ListModels mixes in embedding/aqa/etc. entries that can't
    // generate chat content at all — without this filter they'd dominate
    // the dropdown.
    const raw: RawModel[] = items
      .filter(item => item.supportedGenerationMethods?.includes("generateContent"))
      .map(item => {
        const id = item.name.replace(/^models\//, "")
        // Google has no per-model creation date via this API, and — despite
        // being documented — no baseModelId in practice either; grouping
        // falls back to stripping the pinned-revision suffix ourselves.
        return { id, baseId: googleBaseId(id, item.baseModelId) }
      })

    return { status: "ok", models: classifyModels("google", raw, catalog) }
  } catch (error: any) {
    logger.warn("remote model discovery failed", { provider: "google", error: error?.message })
    return { status: "error" }
  }
}

async function discoverMistral(apiKey: string, catalog: any): Promise<ProviderResult> {
  try {
    const res = await timedFetch("https://api.mistral.ai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    if (!res.ok) return { status: statusFromResponse(res) }

    const json = await res.json()
    const items: { id: string; created?: number }[] = json?.data ?? []
    const raw: RawModel[] = items
      .filter(item => !/embed/i.test(item.id))
      .map(item => ({
        id: item.id,
        baseId: baseName(item.id),
        createdAt: item.created != null ? item.created * 1000 : undefined
      }))

    return { status: "ok", models: classifyModels("mistral", raw, catalog) }
  } catch (error: any) {
    logger.warn("remote model discovery failed", { provider: "mistral", error: error?.message })
    return { status: "error" }
  }
}

async function discoverProvider(
  provider: RemoteProvider,
  apiKey: string,
  catalog: any
): Promise<ProviderResult> {
  const cacheKey = `${provider}:${apiKey}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  let result: ProviderResult
  switch (provider) {
    case "openai":
      result = await discoverOpenAICompat(
        "openai",
        "https://api.openai.com/v1",
        apiKey,
        catalog
      )
      break
    case "groq":
      result = await discoverOpenAICompat(
        "groq",
        "https://api.groq.com/openai/v1",
        apiKey,
        catalog
      )
      break
    case "anthropic":
      result = await discoverAnthropic(apiKey, catalog)
      break
    case "google":
      result = await discoverGoogle(apiKey, catalog)
      break
    case "mistral":
      result = await discoverMistral(apiKey, catalog)
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

  const catalog = await getModelsDevCatalog()

  const settled = await Promise.allSettled(
    entries.map(([provider, apiKey]) => discoverProvider(provider, apiKey, catalog))
  )

  const results: Partial<Record<RemoteProvider, ProviderResult>> = {}
  entries.forEach(([provider], i) => {
    const outcome = settled[i]
    results[provider] = outcome.status === "fulfilled" ? outcome.value : { status: "error" }
  })

  return Response.json({ results })
}
