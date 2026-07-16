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

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Sent as a raw body rather than multipart/form-data — see the matching
    // comment in right-sidebar.tsx's handleAgentFile for why.
    const encodedName = request.headers.get("x-agent-filename")
    const fileName = encodedName ? decodeURIComponent(encodedName) : null

    if (!fileName) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (!fileName.endsWith(".agent")) {
      return NextResponse.json(
        { error: "File must have .agent extension" },
        { status: 400 }
      )
    }

    const buffer = await request.arrayBuffer()
    const bundle = await loadAgent(buffer)

    const am = bundle.aboutme
    return NextResponse.json({
      aboutme: {
        id: am.id,
        name: am.name,
        version: am.version,
        domain: am.domain,
        description: am.description,
        persona: bundle.files.persona,
        license: am.license
      },
      behaviorText: bundle.files.behavior,
      descriptionText: bundle.files.description,
      knowledge: bundle.files.knowledge ?? [],
      guides: bundle.files.guides ?? [],
      behaviors: bundle.files.behaviors ?? []
    })
  } catch (error: any) {
    console.error("Agent unpack error:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to unpack agent" },
      { status: 500 }
    )
  }
}
