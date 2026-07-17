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
import { dispatchRuntimeAction } from "@/lib/runtime/runtime-actions"

// CSS files referenced by `apply css "<value>"` in a .behavior are not bundled
// inside the .agent package (the compiler doesn't extract css/ yet — that's a
// v0.2 concern). Instead they're served as static files from this folder, and
// the effect's `value` is used verbatim as the filename.
const AGENT_STYLES_BASE = "/agent-styles/"

const CSS_LINK_ID_PREFIX = "dot-agent-css:"

function cssLinkId(value: string): string {
  return `${CSS_LINK_ID_PREFIX}${value}`
}

export function applyKernelCss(value: string) {
  if (typeof document === "undefined") return
  const id = cssLinkId(value)
  if (document.getElementById(id)) return
  const link = document.createElement("link")
  link.id = id
  link.rel = "stylesheet"
  link.href = AGENT_STYLES_BASE + value
  document.head.appendChild(link)
}

export function removeKernelCss(value: string) {
  if (typeof document === "undefined") return
  document.getElementById(cssLinkId(value))?.remove()
}

// Makes document.head's dot-agent stylesheet links match `desired` exactly:
// adds whatever is missing, removes whatever shouldn't be there. This is the
// ONLY place that should ever be called with a thread's desired CSS set — see
// project/plans/017 and KernelPresentationHost, the reconciler that calls this
// with `desired = activeCss[viewedThreadId]` any time it changes.
//
// Guarantees set membership only, not `<head>` ordering (see the plan's Open
// Questions) — sufficient unless two agent stylesheets conflict on the same
// selector, in which case cascade order would need revisiting.
export function reconcileCssLinks(desired: string[]) {
  if (typeof document === "undefined") return

  const desiredSet = new Set(desired)
  document
    .querySelectorAll<HTMLLinkElement>(`link[id^="${CSS_LINK_ID_PREFIX}"]`)
    .forEach(link => {
      const value = link.id.slice(CSS_LINK_ID_PREFIX.length)
      if (!desiredSet.has(value)) link.remove()
    })

  for (const value of desired) {
    applyKernelCss(value)
  }
}

// Runtime actions (project/plans/017, docs/architecture/runtime-actions.md)
// currently ride on the `run_script` effect — a stopgap until the dot-agent
// spec separates "run an external script" from "invoke a host UI action".
// Forwards each target straight into the dispatcher: the action's name IS the
// vocabulary entry, so there is no mapping table to keep in sync here.
export function handleRuntimeActions(effects: Effect[] | undefined | null) {
  if (!Array.isArray(effects)) return

  for (const effect of effects) {
    if (effect.type === "run_script") {
      dispatchRuntimeAction(effect.target)
    }
  }
}
