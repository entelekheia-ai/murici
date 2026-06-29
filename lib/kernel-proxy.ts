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

export class KernelProxy {
  private _currentState = ""
  private _graph: string | null = null
  private _validIntents: string[] = []
  private _sessionId = Math.random().toString(36).slice(2)

  constructor() {}

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
    const res = await fetch("/api/agent/kernel/tick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: this._sessionId })
    })
    const { effects } = await res.json()
    return effects
  }

  private async _call(
    method: string,
    payload: Record<string, any>
  ): Promise<KernelState> {
    let endpoint = `/api/agent/kernel/${method}`
    if (method === "sendIntent") endpoint = "/api/agent/kernel/intent"
    if (method === "sendOfftopic") endpoint = "/api/agent/kernel/offtopic"
    if (method === "injectMemory") endpoint = "/api/agent/kernel/inject-memory"
    const payloadWithSession = { ...payload, sessionId: this._sessionId }
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadWithSession)
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || err.message || "Kernel error")
    }

    return await res.json()
  }

  private _updateCache(state: KernelState): Effect[] {
    this._currentState = state.currentState
    this._graph = state.graph
    this._validIntents = state.validIntents
    return state.effects
  }
}
