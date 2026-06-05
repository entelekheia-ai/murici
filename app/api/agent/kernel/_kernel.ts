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

import { Effect } from "@/types/kernel-effect"
import { KernelState } from "@/types/electron"

let kernel: any = null
let initialized = false

export async function getKernel(): Promise<any> {
  if (!initialized) {
    const kernelModule = await import("@dot-agent/kernel-dsl") as any
    await kernelModule.init()
    initialized = true
  }
  if (!kernel) {
    const kernelModule = await import("@dot-agent/kernel-dsl") as any
    kernel = new kernelModule.AgentDSLKernel()
  }
  return kernel
}

export function resetKernel(): void {
  kernel = null
}

export function buildKernelState(eng: any, effects: Effect[]): KernelState {
  const state = eng.get_current_state()
  const graph = eng.get_graph()
  const validIntents = Array.from(eng.get_valid_intents() || []) as string[]
  const hasOfftopic =
    graph?.transitions?.some(
      (t: any) => t.from === state && t.label === "offtopic"
    ) ?? false

  return {
    currentState: state,
    graph,
    validIntents,
    hasOfftopic,
    effects
  }
}
