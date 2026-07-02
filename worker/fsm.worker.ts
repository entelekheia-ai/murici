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

interface PendingMemoryWrite {
  domain: string
  key: string
  value: string
}

interface SessionEntry {
  session: AgentSession
  sink: { current: Effect[] }
  text: string
  pendingMemory: PendingMemoryWrite[]
}

const sessions = new Map<string, SessionEntry>()

// wasm-bindgen panics with "recursive use of an object detected which would
// lead to unsafe aliasing" if a Rust-invoked JS callback calls back into the
// same AgentSession while it's still on the call stack (e.g. a set_memory
// effect firing injectMemory() synchronously during sendIntent/tickPrompt).
// So set_memory writes are queued here and flushed via flushPendingMemory()
// once the outer kernel call has returned to the top of the worker's message
// loop, turning the nested call into a top-level one.
function wireHandlers(
  session: AgentSession,
  pendingMemory: PendingMemoryWrite[]
): { current: Effect[] } {
  const localSink: { current: Effect[] } = { current: [] }
  for (const type of EFFECT_TYPES) {
    if (type === "set_memory") {
      session.registerHandler(type, (e: any) => {
        localSink.current.push(e as Effect)
        pendingMemory.push({
          domain: e.domain,
          key: e.key,
          value: String(e.value ?? "")
        })
      })
    } else {
      session.registerHandler(type, (e: any) => {
        localSink.current.push(e as Effect)
      })
    }
  }
  return localSink
}

function flushPendingMemory(entry: SessionEntry) {
  let guard = 0
  while (entry.pendingMemory.length > 0 && guard++ < 100) {
    const { domain, key, value } = entry.pendingMemory.shift()!
    entry.session.injectMemory(domain, key, value)
  }
  if (guard >= 100) {
    console.warn(
      "[fsm.worker] pendingMemory drain guard hit — possible set_memory cycle"
    )
  }
}

function buildKernelState(session: AgentSession, effects: Effect[]): KernelState {
  const state = session.getState()
  const scxml = session.getGraph()
  const graph = scxml && scxml.length > 0 ? scxml : null
  const validIntents = Array.from(session.getValidIntents() || []) as string[]
  return { currentState: state, graph, validIntents, effects }
}

// Serialize message handling: without this, two overlapping postMessage
// deliveries (e.g. the main chat flow and a background headless agent both
// calling into the shared worker) could interleave around the only real
// await in this file (AgentSession.create in the "load" branch), racing
// against the wasm module's shared FFI marshalling stack.
let messageQueue: Promise<void> = Promise.resolve()

self.onmessage = (e: MessageEvent) => {
  messageQueue = messageQueue.then(() => processMessage(e))
}

async function processMessage(e: MessageEvent) {
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
        flushPendingMemory(old)
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
      const pendingMemory: PendingMemoryWrite[] = []
      const sink = wireHandlers(session, pendingMemory)
      sink.current = []
      session.start()
      const entry: SessionEntry = { session, sink, text: behaviorText, pendingMemory }
      sessions.set(sessionId, entry)
      flushPendingMemory(entry)

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
      flushPendingMemory(entry)
      self.postMessage({ id, state: buildKernelState(entry.session, entry.sink.current) })
      return
    }

    if (method === "sendOfftopic") {
      entry.session.sendEvent("offtopic")
      flushPendingMemory(entry)
      self.postMessage({ id, state: buildKernelState(entry.session, entry.sink.current) })
      return
    }

    if (method === "injectMemory") {
      entry.session.injectMemory(payload.domain, payload.key, payload.value)
      flushPendingMemory(entry)
      self.postMessage({ id, state: buildKernelState(entry.session, entry.sink.current) })
      return
    }

    if (method === "tick") {
      entry.session.tickPrompt()
      flushPendingMemory(entry)
      self.postMessage({ id, state: buildKernelState(entry.session, entry.sink.current) })
      return
    }

    throw new Error(`Unknown method: ${method}`)
  } catch (error: any) {
    self.postMessage({ id, error: error.message })
  }
}
