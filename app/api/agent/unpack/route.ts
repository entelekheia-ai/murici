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

import { NextRequest, NextResponse } from "next/server"
import { loadAgent } from "@dot-agent/sdk"

function resolveMerges(
  behaviorContent: string,
  behaviors: Array<{ path: string; content: string }>
): string {
  if (behaviors.length === 0) return behaviorContent

  const behaviorMap = new Map(behaviors.map(b => [b.path, b.content]))
  const lines = behaviorContent.split("\n")
  const result: string[] = []
  let inPreamble = true

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("state ")) inPreamble = false

    if (inPreamble && trimmed.startsWith('merge "')) {
      const match = trimmed.match(/^merge\s+"([^"]+)"/)
      if (match) {
        const merged = behaviorMap.get(match[1])
        if (merged) {
          result.push(merged)
        } else {
          console.error(`merge target not found in bundle: ${match[1]}`)
          result.push(line)
        }
      } else {
        result.push(line)
      }
    } else {
      result.push(line)
    }
  }

  return result.join("\n")
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    if (!file.name.endsWith(".agent")) {
      return NextResponse.json(
        { error: "File must have .agent extension" },
        { status: 400 }
      )
    }

    const buffer = await file.arrayBuffer()
    const bundle = await loadAgent(buffer)

    const behaviorText = resolveMerges(
      bundle.files.behavior,
      bundle.files.behaviors
    )

    const am = bundle.aboutme
    return NextResponse.json({
      aboutme: {
        id: am.id,
        name: am.name,
        version: am.version,
        domain: am.domain,
        description: am.description,
        persona: am.persona,
        license: am.license
      },
      behaviorText
    })
  } catch (error: any) {
    console.error("Agent unpack error:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to unpack agent" },
      { status: 500 }
    )
  }
}
