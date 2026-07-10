/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { BehaviorStateInfo } from "@/lib/runtime/dot-agent-injector"

// Minimal shape of the kernel proxy this transform reads. Kept structural so
// both KernelProxy and any test double satisfy it.
interface FlowEngineLike {
  get_current_state(): string
  get_graph(): string | null
  get_valid_intents(): string[]
}

/**
 * A `teach` effect's text is either an inline string or the name of a knowledge
 * file to resolve to its content. Single definition shared by the initial load
 * (loadBehavior) and every subsequent FSM advance so the two can't diverge.
 */
export function resolveTeach(
  name: string | undefined,
  know: Array<{ path: string; content: string }>
): string | undefined {
  if (!name) return undefined
  const entry = know.find(
    k =>
      k.path === name ||
      k.path === `knowledge/${name}` ||
      k.path.endsWith(`/${name}`)
  )
  return entry ? entry.content : name
}

/**
 * Turns the effects returned by a kernel call (load_behavior / send_intent) plus
 * the engine's now-updated cache into the canonical BehaviorStateInfo the UI
 * (flowState) and the LLM (behaviorState / tool result) both consume.
 *
 * This is the single source of truth for the effects -> flowState transform;
 * loadBehavior and the interactive trigger_intent advance both go through it so
 * a state transition looks identical no matter which path produced it.
 */
export function buildFlowStateFromEffects(
  engine: FlowEngineLike,
  effects: any[],
  knowledge: Array<{ path: string; content: string }> = []
): BehaviorStateInfo {
  const goal = effects.find((e: any) => e.type === "goal")?.text
  const guide = effects.find((e: any) => e.type === "guide")?.text
  const teach = resolveTeach(
    effects.find((e: any) => e.type === "teach")?.text,
    knowledge
  )
  return {
    currentState: engine.get_current_state(),
    goal,
    guide,
    teach,
    validIntents: Array.from(engine.get_valid_intents() || []) as string[],
    graph: engine.get_graph()
  }
}
