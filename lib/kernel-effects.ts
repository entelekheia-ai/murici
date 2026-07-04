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

// CSS files referenced by `apply css "<value>"` in a .behavior are not bundled
// inside the .agent package (the compiler doesn't extract css/ yet — that's a
// v0.2 concern). Instead they're served as static files from this folder, and
// the effect's `value` is used verbatim as the filename.
const AGENT_STYLES_BASE = "/agent-styles/"

function cssLinkId(value: string): string {
  return `dot-agent-css:${value}`
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

export interface KernelEffectHandlers {
  setShowRightSidebar: (show: boolean) => void
}

export function handleKernelEffects(
  effects: Effect[] | undefined | null,
  handlers: KernelEffectHandlers
) {
  if (!Array.isArray(effects)) return

  for (const effect of effects) {
    switch (effect.type) {
      case "apply_css":
        applyKernelCss(effect.value)
        break
      case "remove_css":
        removeKernelCss(effect.value)
        break
      case "run_script":
        switch (effect.target) {
          case "open_agents_panel":
            handlers.setShowRightSidebar(true)
            break
          case "open_model_selector":
            window.dispatchEvent(new CustomEvent("murici:model-selector-open"))
            break
          case "open_settings_auto_task":
            window.dispatchEvent(new CustomEvent("murici:profile-open"))
            break
          case "open_mcp_config":
            window.dispatchEvent(
              new CustomEvent("murici:profile-open", { detail: { tab: "mcp" } })
            )
            break
          default:
            // Unknown script target: no-op, same as today's silent drop.
            break
        }
        break
      default:
        break
    }
  }
}
