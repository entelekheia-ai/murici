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

#!/usr/bin/env node

/**
 * Advanced diagnostic script for .behavior files
 * Checks for encoding issues, invalid characters, and structure problems
 */

import { readFile, rm, mkdtemp } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { unpack } from "@dot-agent/cli"
import { writeFileSync } from "fs"

function analyzeText(text, name = "Text") {
  console.log(`\n=== ${name} Analysis ===`)
  console.log(`Length: ${text.length}`)
  console.log(`Type: ${typeof text}`)
  console.log(`UTF-8 encoded size: ${Buffer.byteLength(text, "utf-8")} bytes`)

  // Check for control characters
  const controlChars = []
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    // Invalid control chars: 0x00-0x08, 0x0B-0x0C, 0x0E-0x1F
    if ((code >= 0x00 && code <= 0x08) || (code >= 0x0b && code <= 0x0c) || (code >= 0x0e && code <= 0x1f)) {
      controlChars.push({ pos: i, code, char: code.toString(16) })
    }
  }

  if (controlChars.length > 0) {
    console.log(`⚠️  Found ${controlChars.length} invalid control characters:`)
    controlChars.slice(0, 5).forEach(c => {
      console.log(`  Position ${c.pos}: 0x${c.char.padStart(2, "0")}`)
    })
    if (controlChars.length > 5) {
      console.log(`  ... and ${controlChars.length - 5} more`)
    }
  } else {
    console.log("✅ No invalid control characters")
  }

  // Check for null bytes
  if (text.includes("\x00")) {
    console.log("⚠️  Contains null bytes (0x00)")
  } else {
    console.log("✅ No null bytes")
  }

  // Check for valid structure
  const lines = text.split("\n")
  console.log(`Lines: ${lines.length}`)

  const trimmed = text.trim()
  if (trimmed.startsWith("state ")) {
    console.log("✅ Starts with 'state' declaration")
  } else if (trimmed.startsWith("//")) {
    console.log("✅ Starts with comment")
  } else {
    console.log(`⚠️  Unexpected start: "${trimmed.substring(0, 50)}"`)
  }

  // Check indentation
  const hasIndentation = lines.some(l => l.startsWith("  "))
  console.log(`✅ Has indentation: ${hasIndentation}`)

  // First 200 chars
  console.log(`\nFirst 200 chars (hex dump):`)
  const sample = text.substring(0, 200)
  const bytes = Buffer.from(sample, "utf-8")
  let hex = ""
  for (let i = 0; i < Math.min(bytes.length, 100); i++) {
    hex += bytes[i].toString(16).padStart(2, "0") + " "
  }
  console.log(hex)

  console.log(`\nFirst 200 chars (text):`)
  console.log(sample.replace(/\n/g, "\\n"))
}

async function validateWithKernel(behaviorText) {
  console.log("\n=== Kernel Validation ===")
  try {
    const kernelModule = await import("@dot-agent/kernel-dsl")
    await kernelModule.init()
    const kernel = new kernelModule.AgentDSLKernel()

    console.log("Attempting to load behavior...")
    const effects = kernel.load_behavior(behaviorText)

    console.log("✅ Kernel accepted the behavior!")
    console.log("Effects:")
    console.log(JSON.stringify(effects, null, 2))

    const state = kernel.get_current_state()
    console.log(`Initial state: ${state}`)

    const graph = kernel.get_graph()
    console.log(`States: ${graph?.states?.join(", ")}`)
  } catch (e) {
    console.error("❌ Kernel rejection:")
    console.error(`Error: ${e?.message}`)
    console.error(`Stack: ${e?.stack}`)
  }
}

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.log(`
Usage:
  node test-behavior-validation.js <path-to-behavior-file>
  node test-behavior-validation.js <path-to-agent-file> --unpack

Examples:
  node test-behavior-validation.js ./mybehavior.flow
  node test-behavior-validation.js ./myagent.agent --unpack
    `)
    process.exit(0)
  }

  const filePath = args[0]
  const shouldUnpack = args.includes("--unpack")

  try {
    let behaviorText

    if (shouldUnpack && filePath.endsWith(".agent")) {
      console.log("Unpacking .agent file...")
      const tmpDir = await mkdtemp(join(tmpdir(), "validate-"))

      try {
        const buffer = require("fs").readFileSync(filePath)
        const tmpFile = join(tmpDir, "temp.agent")
        writeFileSync(tmpFile, buffer)

        console.log("Running unpack...")
        const unpackResult = await unpack({
          file: tmpFile,
          out: join(tmpDir, "unpacked"),
          force: true
        })

        console.log("Reading agent.behavior...")
        const behaviorPath = join(tmpDir, "unpacked", "agent.behavior")
        behaviorText = await readFile(behaviorPath, "utf-8")
        console.log("✅ Successfully unpacked and read agent.behavior\n")
      } finally {
        await rm(tmpDir, { recursive: true, force: true })
      }
    } else {
      console.log(`Reading ${filePath}...`)
      behaviorText = await readFile(filePath, "utf-8")
      console.log("✅ Successfully read file\n")
    }

    analyzeText(behaviorText, filePath)
    await validateWithKernel(behaviorText)
  } catch (error) {
    console.error("\n❌ Error:", error?.message)
    console.error(error?.stack)
    process.exit(1)
  }
}

await main()
