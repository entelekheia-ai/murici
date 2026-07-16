/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { logger } from "@/lib/logger"

// The runtime-action vocabulary. See docs/architecture/runtime-actions.md for
// the full contract (naming convention, core vs runtime-specific layers,
// why there is no vendor prefix). This array is the single source of truth —
// the doc mirrors it, it doesn't define it.
//
// Names are vendor-neutral (`chat:*`, `settings:*`, not `murici:*`) so a
// portable `.agent` package can target the same action across runtimes: an
// unrecognized action is a graceful no-op here, not an error.
export const RUNTIME_ACTIONS = [
  "chat:models-selector-open",
  "chat:agents-details-open",
  "settings:mcp-open",
  "settings:ai-helper-open"
] as const

export type RuntimeAction = (typeof RUNTIME_ACTIONS)[number]

function isRuntimeAction(action: string): action is RuntimeAction {
  return (RUNTIME_ACTIONS as readonly string[]).includes(action)
}

// Validates `action` against the vocabulary and, if known, re-dispatches it as
// a `window` CustomEvent of the SAME name — there is no translation table.
// Each UI surface implements the action it owns via its own listener (see
// chat-settings.tsx, profile-settings.tsx, agent-session-provider.tsx).
//
// An unknown action is a no-op (plus a debug log): this IS the
// feature-detection behavior a portable `.agent` package relies on when it
// targets an action a given runtime hasn't implemented yet.
export function dispatchRuntimeAction(action: string): void {
  if (typeof window === "undefined") return
  if (!isRuntimeAction(action)) {
    logger.debug("Unknown runtime action, ignoring", { action })
    return
  }
  window.dispatchEvent(new CustomEvent(action))
}
