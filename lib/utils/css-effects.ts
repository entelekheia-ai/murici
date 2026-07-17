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

// Pure fold of a thread's desired CSS set against a batch of kernel effects.
// `apply_css` appends (if not already present, keeping its earlier position);
// `remove_css` drops it. Everything else is ignored — this is CSS-only, see
// runtime-actions.ts for run_script. Returns the SAME array reference when the
// batch produces no actual change, so callers (the channel store) can skip a
// state update and avoid re-rendering subscribers.
export function foldCssEffects(
  prev: string[],
  effects: Effect[] | undefined | null
): string[] {
  if (!Array.isArray(effects) || effects.length === 0) return prev

  let next = prev
  for (const effect of effects) {
    if (effect.type === "apply_css") {
      if (!next.includes(effect.value)) {
        next = [...next, effect.value]
      }
    } else if (effect.type === "remove_css") {
      if (next.includes(effect.value)) {
        next = next.filter(value => value !== effect.value)
      }
    }
  }
  return next
}
