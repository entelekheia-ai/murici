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
 * Simple test to diagnose the kernel WASM error
 */

(async () => {
  try {
    console.log("Importing @dot-agent/kernel-dsl...")
    const kernelModule = await import("@dot-agent/kernel-dsl")

    console.log("Initializing kernel...")
    await kernelModule.init()

    console.log("Creating AgentDSLKernel instance...")
    const kernel = new kernelModule.AgentDSLKernel()

    const behaviorText = `state welcome
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

    console.log("\n=== Testing load_behavior ===")
    console.log("behaviorText length:", behaviorText.length)
    console.log("behaviorText type:", typeof behaviorText)
    console.log("First 100 chars:", behaviorText.substring(0, 100))

    console.log("\nCalling kernel.load_behavior()...")
    const effects = kernel.load_behavior(behaviorText)

    console.log("✅ SUCCESS! Effects returned:")
    console.log(JSON.stringify(effects, null, 2))

    const state = kernel.get_current_state()
    console.log("\nCurrent state:", state)

    const graph = kernel.get_graph()
    console.log("Graph:", JSON.stringify(graph, null, 2))
  } catch (e) {
    console.error("\n❌ ERROR:")
    console.error("Name:", e?.name)
    console.error("Message:", e?.message)
    console.error("Stack:", e?.stack)
    console.error("Full error:", e)

    // Try to extract more details
    if (e instanceof TypeError) {
      console.error("\nThis is a TypeError - likely the WASM encoding issue")
    }

    process.exit(1)
  }
})()
