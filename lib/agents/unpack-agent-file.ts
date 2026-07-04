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

export async function unpackAgentFileFromUrl(
  url: string,
  filename: string
): Promise<UnpackPayload> {
  const fileRes = await fetch(url)
  if (!fileRes.ok) throw new Error(`Failed to fetch ${url}`)
  const agentBlob = await fileRes.blob()
  const unpackRes = await fetch("/api/agent/unpack", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Agent-Filename": filename
    },
    body: agentBlob
  })
  if (!unpackRes.ok) throw new Error("Failed to unpack agent")
  return unpackRes.json()
}
