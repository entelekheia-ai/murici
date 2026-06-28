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
      behaviorText: bundle.files.behavior,
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
