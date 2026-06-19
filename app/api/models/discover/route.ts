/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { LLM } from "@/types"
import { readFile } from "fs/promises"
import { homedir } from "os"
import { join } from "path"

const DISCOVERY_TIMEOUT_MS = 500

interface OmlxSettings {
  server?: { host?: string; port?: number }
  auth?: { api_key?: string }
}

async function readOmlxSettings(): Promise<OmlxSettings> {
  try {
    const raw = await readFile(
      join(homedir(), ".omlx", "settings.json"),
      "utf-8"
    )
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function probeOpenAICompat(
  baseUrl: string,
  apiKey?: string
): Promise<LLM[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS)

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`

    const res = await fetch(`${baseUrl}/v1/models`, {
      signal: controller.signal,
      headers
    })
    if (!res.ok) return []

    const json = await res.json()
    const items: { id: string }[] = json?.data ?? []

    return items.map(item => ({
      modelId: item.id,
      modelName: item.id,
      provider: "local",
      hostedId: item.id,
      platformLink: "",
      imageInput: false,
      baseUrl,
      ...(apiKey ? { apiKey } : {})
    }))
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

async function probeOllama(baseUrl: string): Promise<LLM[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS)

  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal })
    if (!res.ok) return []

    const json = await res.json()
    const models: { name: string }[] = json?.models ?? []

    return models.map(m => ({
      modelId: m.name,
      modelName: m.name,
      provider: "local",
      hostedId: m.name,
      platformLink: "",
      imageInput: false,
      baseUrl
    }))
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

export async function GET() {
  const omlx = await readOmlxSettings()
  const omlxHost = omlx.server?.host ?? "localhost"
  const omlxPort = omlx.server?.port ?? 8000
  const omlxApiKey = omlx.auth?.api_key
  const omlxBaseUrl = `http://${omlxHost}:${omlxPort}`

  const ollamaBaseUrl =
    process.env.NEXT_PUBLIC_OLLAMA_URL ?? "http://localhost:11434"

  const results = await Promise.allSettled([
    probeOllama(ollamaBaseUrl),
    probeOpenAICompat("http://localhost:1234"),           // LM Studio
    probeOpenAICompat("http://localhost:8080"),           // LocalAI / Llama.cpp
    probeOpenAICompat(omlxBaseUrl, omlxApiKey),          // oMLX / vLLM
    probeOpenAICompat("http://localhost:5000")            // Oobabooga
  ])

  const models: LLM[] = results.flatMap(r =>
    r.status === "fulfilled" ? r.value : []
  )

  return Response.json(models)
}
