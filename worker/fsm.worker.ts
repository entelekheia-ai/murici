/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { AgentSession, AgentBundle } from "@dot-agent/sdk"
import { Effect } from "@/types/kernel-effect"
import { KernelState } from "@/types/electron"

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
  text: string
}

const sessions = new Map<string, SessionEntry>()

function wireHandlers(session: AgentSession): { current: Effect[] } {
  const localSink: { current: Effect[] } = { current: [] }
  for (const type of EFFECT_TYPES) {
    if (type === "set_memory") {
      session.registerHandler(type, (e: any) => {
        localSink.current.push(e as Effect)
        session.injectMemory(e.domain, e.key, String(e.value ?? ""))
      })
    } else {
      session.registerHandler(type, (e: any) => {
        localSink.current.push(e as Effect)
      })
    }
  }
  return localSink
}

function buildKernelState(session: AgentSession, effects: Effect[]): KernelState {
  const state = session.getState()
  const scxml = session.getGraph()
  const graph = scxml && scxml.length > 0 ? scxml : null
  const validIntents = Array.from(session.getValidIntents() || []) as string[]
  return { currentState: state, graph, validIntents, effects }
}

self.onmessage = async (e: MessageEvent) => {
  const { id, method, payload } = e.data
  const sessionId = payload?.sessionId
  
  try {
    if (method === "DESTROY") {
      if (sessionId && sessions.has(sessionId)) {
        sessions.get(sessionId)!.session.dispose()
        sessions.delete(sessionId)
      }
      self.postMessage({ id, state: null })
      return
    }

    if (method === "load") {
      const { behaviorText, knowledge = [], guides = [], behaviors = [] } = payload
      
      const old = sessions.get(sessionId)
      if (old && old.text === behaviorText) {
        old.session.start()
        self.postMessage({ id, state: buildKernelState(old.session, old.sink.current) })
        return
      }

      if (old) {
        old.session.dispose()
        sessions.delete(sessionId)
      }

      const bundle = {
        id: sessionId || "default",
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
      sessions.set(sessionId, { session, sink, text: behaviorText })
      
      self.postMessage({ id, state: buildKernelState(session, sink.current) })
      return
    }

    const entry = sessions.get(sessionId)
    if (!entry) {
      throw new Error(`No active session in worker for id: ${sessionId}`)
    }

    entry.sink.current = [] // clear previous effects
    
    if (method === "sendIntent") {
      entry.session.sendIntent(payload.intent)
      self.postMessage({ id, state: buildKernelState(entry.session, entry.sink.current) })
      return
    }

    if (method === "sendOfftopic") {
      entry.session.sendEvent("offtopic")
      self.postMessage({ id, state: buildKernelState(entry.session, entry.sink.current) })
      return
    }

    if (method === "injectMemory") {
      entry.session.injectMemory(payload.domain, payload.key, payload.value)
      self.postMessage({ id, state: buildKernelState(entry.session, entry.sink.current) })
      return
    }

    if (method === "tick") {
      entry.session.tickPrompt()
      self.postMessage({ id, state: buildKernelState(entry.session, entry.sink.current) })
      return
    }

    throw new Error(`Unknown method: ${method}`)
  } catch (error: any) {
    self.postMessage({ id, error: error.message })
  }
}
