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

import type { UnpackPayload } from "@/types/electron"

/**
 * THE unpack. Every .agent in the app — picked from the file dialog, opened from the
 * OS, clicked in the "Agentes" panel, or auto-loaded as a system agent — is turned
 * into an UnpackPayload here and nowhere else.
 *
 * It used to be two: the Electron main process ran its own loadAgent() and built the
 * payload by hand, and that copy silently dropped `knowledge` and `guides`. An agent
 * opened through Electron therefore lost its knowledge files, and a `teach
 * "recipes.txt"` effect resolved to the bare file NAME (resolveTeach falls back to it),
 * which is what the model then received. Main now only hands over the file's BYTES —
 * the one thing the renderer genuinely cannot do — so there is no second mapping left
 * to drift.
 */
async function unpackAgentBytes(
  body: BodyInit,
  filename: string
): Promise<UnpackPayload> {
  const unpackRes = await fetch("/api/agent/unpack", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Agent-Filename": encodeURIComponent(filename)
    },
    body
  })
  if (!unpackRes.ok) {
    const err = await unpackRes.json().catch(() => null)
    throw new Error(err?.error || "Failed to unpack agent")
  }
  return unpackRes.json()
}

export async function unpackAgentFileFromUrl(
  url: string,
  filename: string
): Promise<UnpackPayload> {
  const fileRes = await fetch(url)
  if (!fileRes.ok) throw new Error(`Failed to fetch ${url}`)
  return unpackAgentBytes(await fileRes.blob(), filename)
}

export async function unpackAgentFile(file: File): Promise<UnpackPayload> {
  return unpackAgentBytes(file, file.name)
}

/**
 * Electron only: resolve a .agent that lives at a filesystem path (OS "open with",
 * the app menu, a row in the "Agentes" panel). Reading an arbitrary path is the one
 * step the renderer is not allowed to do, so main reads the bytes and we unpack them
 * on this side, through the same route as everything else.
 */
export async function unpackAgentFileFromPath(
  filePath: string
): Promise<UnpackPayload> {
  const read = window.electronAPI?.readAgentFile
  if (!read)
    throw new Error("Reading agent files by path requires the desktop app")
  const bytes = await read(filePath)
  const filename = filePath.split(/[\\/]/).pop() || "agent.agent"
  return unpackAgentBytes(new Blob([bytes as any]), filename)
}
