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
 * Test the unpack -> load_behavior flow
 */

import { unpack } from "@dot-agent/cli"
import { readFile, rm, mkdtemp, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { writeFileSync } from "fs"

const testBehaviorText = `state welcome
  goal "Help the user get started"
  guide "Be friendly and concise"
  interact
  on intent "continue" transition to setup
  on offtopic transition to welcome

state setup
  goal "Collect user preferences"
  interact
  on intent "done" transition to end
  on offtopic transition to setup

state end
  goal "Session complete"
  interact
  on intent "restart" transition to welcome`

async function testKernelWithUnpackFlow() {
  const tmpDir = await mkdtemp(join(tmpdir(), "kernel-test-"))

  try {
    console.log("=== Creating test .agent file ===")
    // For this test, we'd need an actual .agent file
    // Since we don't have one, let's just test the kernel directly

    console.log("\n=== Testing kernel directly ===")
    const kernelModule = await import("@dot-agent/kernel-dsl")
    await kernelModule.init()
    const kernel = new kernelModule.AgentDSLKernel()

    console.log("Calling load_behavior with standard text...")
    let effects = kernel.load_behavior(testBehaviorText)
    console.log("✅ Standard text works!")
    console.log("Effects:", JSON.stringify(effects, null, 2))

    // Now test with various encoding scenarios
    console.log("\n=== Testing with UTF-8 BOM ===")
    const utf8BOM = "﻿" + testBehaviorText
    try {
      effects = kernel.load_behavior(utf8BOM)
      console.log("✅ UTF-8 BOM works!")
    } catch (e) {
      console.error("❌ UTF-8 BOM failed:", e.message)
    }

    console.log("\n=== Testing with CRLF line endings ===")
    const crlfText = testBehaviorText.replace(/\n/g, "\r\n")
    try {
      effects = kernel.load_behavior(crlfText)
      console.log("✅ CRLF works!")
    } catch (e) {
      console.error("❌ CRLF failed:", e.message)
    }

    console.log("\n=== Testing with mixed encodings (simulating buffer issue) ===")
    // This simulates what might happen if Buffer.from() doesn't preserve encoding
    const buffer = Buffer.from(testBehaviorText, "utf-8")
    const bufferText = buffer.toString("utf-8")
    try {
      effects = kernel.load_behavior(bufferText)
      console.log("✅ Buffer conversion works!")
    } catch (e) {
      console.error("❌ Buffer conversion failed:", e.message)
    }

    console.log("\n=== Checking if the issue is with file reading ===")
    const testFile = join(tmpDir, "test.behavior")
    await writeFile(testFile, testBehaviorText, "utf-8")
    const readText = await readFile(testFile, "utf-8")
    try {
      effects = kernel.load_behavior(readText)
      console.log("✅ File read works!")
    } catch (e) {
      console.error("❌ File read failed:", e.message)
    }
  } catch (error) {
    console.error("Test failed:", error)
  } finally {
    try {
      await rm(tmpDir, { recursive: true, force: true })
    } catch (e) {
      console.error("Cleanup failed:", e)
    }
  }
}

await testKernelWithUnpackFlow()
