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
import { unpack } from "@dot-agent/cli"
import { readFile, rm, mkdtemp } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { writeFileSync } from "fs"

interface AgentAboutme {
  id: string
  name: string
  version: string
  domain: string
  description: string
  persona: string
  license: string
}

interface UnpackResponse {
  aboutme: AgentAboutme
  behaviorText: string
}

async function resolveMerges(
  behaviorContent: string,
  outDir: string
): Promise<string> {
  const lines = behaviorContent.split("\n")
  const result: string[] = []
  let inPreamble = true

  for (const line of lines) {
    const trimmed = line.trim()

    // Stop preamble when we hit first state declaration
    if (trimmed.startsWith("state ")) {
      inPreamble = false
    }

    if (inPreamble && trimmed.startsWith('merge "')) {
      // Extract merge path: merge "behaviors/planning.flow" -> behaviors/planning.flow
      const match = trimmed.match(/^merge\s+"([^"]+)"/)
      if (match) {
        const mergePath = match[1]
        const fullPath = join(outDir, mergePath)

        try {
          const mergedContent = await readFile(fullPath, "utf-8")
          // Inline the merged content
          result.push(mergedContent)
        } catch (e) {
          console.error(`Failed to read merge file: ${mergePath}`, e)
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
  const tmpDir = await mkdtemp(join(tmpdir(), "agent-"))

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

    // Write uploaded file to disk
    const buffer = await file.arrayBuffer()
    const tmpFile = join(tmpDir, "temp.agent")
    writeFileSync(tmpFile, Buffer.from(buffer))

    // Unpack using @dot-agent/cli
    const unpackResult = await unpack({
      file: tmpFile,
      out: join(tmpDir, "unpacked"),
      force: true
    })

    // Read agent.behavior
    const behaviorPath = join(tmpDir, "unpacked", "agent.behavior")
    let behaviorContent = await readFile(behaviorPath, "utf-8")

    // Resolve merge directives
    behaviorContent = await resolveMerges(
      behaviorContent,
      join(tmpDir, "unpacked")
    )

    // Extract aboutme from unpack result
    const aboutme = unpackResult.aboutme
    const unpackResponse: UnpackResponse = {
      aboutme: {
        id: aboutme.id,
        name: aboutme.name,
        version: aboutme.version,
        domain: aboutme.domain,
        description: aboutme.description,
        persona: aboutme.persona,
        license: aboutme.license
      },
      behaviorText: behaviorContent
    }

    return NextResponse.json(unpackResponse)
  } catch (error: any) {
    console.error("Agent unpack error:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to unpack agent" },
      { status: 500 }
    )
  } finally {
    // Clean up temp files
    try {
      await rm(tmpDir, { recursive: true, force: true })
    } catch (e) {
      console.error("Failed to clean up temp files:", e)
    }
  }
}
