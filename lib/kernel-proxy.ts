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

let sharedWorker: Worker | null = null
let pendingCalls = new Map<string, { resolve: (val: any) => void, reject: (err: any) => void }>()

function getSharedWorker() {
  if (typeof window === "undefined") return null
  if (!sharedWorker) {
    sharedWorker = new Worker(new URL('../worker/fsm.worker.ts', import.meta.url))
    sharedWorker.onmessage = (e) => {
      const { id, state, error } = e.data
      const pending = pendingCalls.get(id)
      if (pending) {
        pendingCalls.delete(id)
        if (error) pending.reject(new Error(error))
        else pending.resolve(state)
      }
    }
  }
  return sharedWorker
}

export class KernelProxy {
  private _currentState = ""
  private _graph: string | null = null
  private _validIntents: string[] = []
  private _sessionId = Math.random().toString(36).slice(2)

  constructor() {
    getSharedWorker()
  }

  destroy() {
    const worker = getSharedWorker()
    if (worker) {
      worker.postMessage({ id: "destroy", method: "DESTROY", payload: { sessionId: this._sessionId } })
    }
  }

  get_current_state(): string {
    return this._currentState
  }

  get_graph(): string | null {
    return this._graph
  }

  get_valid_intents(): string[] {
    return this._validIntents
  }

  observe(_cb: (e: Effect) => void): void {
    // no-op: effects return directly in KernelState
  }

  async load_behavior(
    text: string,
    knowledge: Array<{ path: string; content: string }> = [],
    guides: Array<{ path: string; content: string }> = [],
    behaviors: Array<{ path: string; content: string }> = []
  ): Promise<Effect[]> {
    const state = await this._call("load", { behaviorText: text, knowledge, guides, behaviors })
    return this._updateCache(state)
  }

  async send_intent(intent: string): Promise<Effect[]> {
    const state = await this._call("sendIntent", { intent })
    return this._updateCache(state)
  }

  async send_offtopic(): Promise<Effect[]> {
    const state = await this._call("sendOfftopic", {})
    return this._updateCache(state)
  }

  async inject_memory(domain: string, key: string, value: string): Promise<Effect[]> {
    const state = await this._call("injectMemory", { domain, key, value })
    return this._updateCache(state)
  }

  async tick_prompt(): Promise<Effect[]> {
    const state = await this._call("tick", {})
    return this._updateCache(state)
  }

  private async _call(method: string, payload: Record<string, any> = {}): Promise<KernelState> {
    const worker = getSharedWorker()
    if (!worker) throw new Error("Worker not initialized")
    const id = Math.random().toString(36).slice(2)
    payload.sessionId = this._sessionId
    return new Promise((resolve, reject) => {
      pendingCalls.set(id, { resolve, reject })
      worker.postMessage({ id, method, payload })
    })
  }

  private _updateCache(state: KernelState): Effect[] {
    this._currentState = state.currentState
    this._graph = state.graph
    this._validIntents = state.validIntents
    return state.effects
  }
}
