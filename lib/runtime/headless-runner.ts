/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import { LLM } from "@/types"
import { KernelProxy } from "@/lib/kernel-proxy"

export interface HeadlessResult {
  title?: string
  summary?: string
  [key: string]: any
}

function getBaseUrl(modelData: LLM): string {
  if (modelData.baseUrl) return modelData.baseUrl
  try {
    const envUrl = process.env.NEXT_PUBLIC_OLLAMA_URL
    if (envUrl) return envUrl
  } catch {}
  return "http://localhost:11434"
}

const agentCache = new Map<string, string>()

export async function runHeadlessAgent(
  content: string,
  modelData: LLM,
  agentUrl: string,
  initialIntent: string
): Promise<HeadlessResult | null> {
  let behaviorText = agentCache.get(agentUrl)

  if (!behaviorText) {
    // 1. Fetch the .agent bundle
    const fileRes = await fetch(`${agentUrl}?t=${Date.now()}`)
    if (!fileRes.ok) {
      throw new Error(`Failed to load agent file from ${agentUrl}`)
    }
    const agentBlob = await fileRes.blob()

    // 2. Unpack the bundle via API. Sent as a raw body rather than
    // multipart/form-data — see the matching comment in right-sidebar.tsx's
    // handleAgentFile for why.
    const agentFileName = agentUrl.split("/").pop() || "agent.agent"
    const unpackRes = await fetch("/api/agent/unpack", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Agent-Filename": encodeURIComponent(agentFileName)
      },
      body: agentBlob
    })
    if (!unpackRes.ok) throw new Error("Failed to unpack agent")
    const data = await unpackRes.json()
    behaviorText = data.behaviorText
    
    if (behaviorText) {
      agentCache.set(agentUrl, behaviorText)
    } else {
      throw new Error("No behavior text extracted")
    }
  }

  // 3. Initialize Kernel
  const kernel = new KernelProxy()
  await kernel.load_behavior(behaviorText)

  // Future-proofing: Injecting memory for JSON mode
  // The V1 TS fallback still takes precedence below if the FSM compiler doesn't branch on this yet.
  await kernel.inject_memory("session", "needJSON", "true")

  // 4. Trigger initial intent
  const preState = kernel.get_current_state()
  const effects = await kernel.send_intent(initialIntent)
  const postState = kernel.get_current_state()
  
  console.log(`[Headless] preState=${preState}, intent=${initialIntent}, postState=${postState}, effects=`, effects)

  const goal = effects.find(e => e.type === "goal")?.text || ""
  const guide = effects.find(e => e.type === "guide")?.text || ""

  if (!goal && !guide) {
    throw new Error("No goal or guide provided by the FSM")
  }

  // 5. Build prompt with TS fallback
  // In V1, we forcefully append the JSON instruction for local models to ensure they comply.
  const systemPrompt = `[FLOW_CONTEXT]\nGoal: ${goal}\nRules: ${guide}\n\nRespond ONLY as JSON: { "intent_name": "save_metadata", "title": "...", "summary": "..." }`

  const baseUrl = getBaseUrl(modelData)
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  }
  if (modelData.apiKey) {
    headers["Authorization"] = `Bearer ${modelData.apiKey}`
  }

  // 6. Execute LLM Call
  let response: Response
  try {
    response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelData.modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content }
        ],
        temperature: 0.3,
        stream: false
      })
    })
  } catch (err) {
    console.error("Headless LLM fetch failed:", err)
    return null
  }

  if (!response.ok) {
    console.error("Headless LLM returned !ok response:", response.status, await response.text().catch(() => ""))
    return null
  }

  // 7. Parse the LLM's response
  let parsed: HeadlessResult
  try {
    const data = await response.json()
    const raw: string =
      data?.choices?.[0]?.message?.content ?? data?.message?.content ?? ""

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error("Headless LLM returned no JSON:", raw)
      kernel.destroy()
      return null
    }

    parsed = JSON.parse(jsonMatch[0])
  } catch (err) {
    kernel.destroy()
    console.error("Headless LLM response parse error:", err)
    return null
  }

  // 8. Validate that it triggered the required intent, distinct from the
  // parsing above so a kernel failure (e.g. a wasm panic) isn't misreported
  // as a JSON parse error.
  if (parsed.intent_name) {
    try {
      await kernel.send_intent(parsed.intent_name)
    } catch (err) {
      console.error("Headless kernel send_intent failed:", err)
      kernel.destroy()
      return null
    }
  }

  kernel.destroy()
  return parsed
}
