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

import { foldCssEffects } from "./css-effects"
import { Effect } from "@/types/kernel-effect"

function applyCss(value: string): Effect {
  return { type: "apply_css", value }
}

function removeCss(value: string): Effect {
  return { type: "remove_css", value }
}

describe("foldCssEffects", () => {
  it("appends a new apply_css value", () => {
    const result = foldCssEffects([], [applyCss("theme.css")])
    expect(result).toEqual(["theme.css"])
  })

  it("removes an existing value on remove_css", () => {
    const result = foldCssEffects(
      ["theme.css", "highlight.css"],
      [removeCss("theme.css")]
    )
    expect(result).toEqual(["highlight.css"])
  })

  it("dedupes: applying an already-present value is a no-op", () => {
    const prev = ["theme.css"]
    const result = foldCssEffects(prev, [applyCss("theme.css")])
    expect(result).toBe(prev)
  })

  it("removing an absent value is a no-op", () => {
    const prev = ["theme.css"]
    const result = foldCssEffects(prev, [removeCss("missing.css")])
    expect(result).toBe(prev)
  })

  it("preserves insertion order and keeps position across a no-op re-apply", () => {
    const prev = ["a.css", "b.css"]
    const result = foldCssEffects(prev, [applyCss("a.css"), applyCss("c.css")])
    expect(result).toEqual(["a.css", "b.css", "c.css"])
  })

  it("applies multiple effects in a single batch in order", () => {
    const result = foldCssEffects(
      ["a.css"],
      [applyCss("b.css"), removeCss("a.css"), applyCss("c.css")]
    )
    expect(result).toEqual(["b.css", "c.css"])
  })

  it("ignores non-css effects", () => {
    const prev = ["a.css"]
    const result = foldCssEffects(prev, [
      { type: "goal", text: "x" },
      { type: "run_script", target: "open_agents_panel", parameters: null, silent: false }
    ])
    expect(result).toBe(prev)
  })

  it("is a no-op (same reference) for an empty or missing effects list", () => {
    const prev = ["a.css"]
    expect(foldCssEffects(prev, [])).toBe(prev)
    expect(foldCssEffects(prev, null)).toBe(prev)
    expect(foldCssEffects(prev, undefined)).toBe(prev)
  })
})
