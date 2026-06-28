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

import { AgentSession } from "@dot-agent/sdk"
import type { AgentBundle } from "@dot-agent/sdk"
import { Effect } from "@/types/kernel-effect"
import { KernelState } from "@/types/electron"

declare global {
  var __kernel_sessions__: Map<string, SessionEntry> | undefined
}

const EFFECT_TYPES = [
  "goal",
  "guide",
  "teach",
  "request_interact",
  "transition",
  "run_tool",
  "run_script",
  "run_subagent",
  "set_memory",
  "apply_css",
  "remove_css",
  "parse_error"
]

interface SessionEntry {
  session: AgentSession
  sink: { current: Effect[] }
}

const getSessionsMap = () => {
  if (!globalThis.__kernel_sessions__) {
    globalThis.__kernel_sessions__ = new Map<string, SessionEntry>()
  }
  return globalThis.__kernel_sessions__ as Map<string, SessionEntry>
}

function wireHandlers(session: AgentSession): { current: Effect[] } {
  const sink: { current: Effect[] } = { current: [] }
  for (const type of EFFECT_TYPES) {
    if (type === "set_memory") {
      session.registerHandler(type, (e: any) => {
        sink.current.push(e as Effect)
        session.injectMemory(e.domain, e.key, String(e.value ?? ""))
      })
    } else {
      session.registerHandler(type, (e) => {
        sink.current.push(e as Effect)
      })
    }
  }
  return sink
}

export async function loadSession(
  sessionId: string,
  behaviorText: string,
  knowledge: Array<{ path: string; content: string }> = [],
  guides: Array<{ path: string; content: string }> = [],
  behaviors: Array<{ path: string; content: string }> = []
): Promise<KernelState> {
  const sessions = getSessionsMap()
  const old = sessions.get(sessionId)
  old?.session.dispose()
  sessions.delete(sessionId)

  const bundle = {
    id: sessionId,
    aboutme: {} as any,
    files: {
      description: "",
      behavior: behaviorText,
      guides,
      knowledge,
      behaviors
    }
  } as AgentBundle

  const session = await AgentSession.create(bundle)
  const sink = wireHandlers(session)
  sink.current = []
  session.start()
  const effects = sink.current
  sessions.set(sessionId, { session, sink })
  return buildKernelState(session, effects)
}

export function getSession(sessionId: string): SessionEntry | undefined {
  return getSessionsMap().get(sessionId)
}

export function buildKernelState(
  session: AgentSession,
  effects: Effect[]
): KernelState {
  const state = session.getState()
  const scxml = session.getGraph()
  const graph = scxml && scxml.length > 0 ? scxml : null
  const validIntents = Array.from(session.getValidIntents() || []) as string[]
  return { currentState: state, graph, validIntents, effects }
}
