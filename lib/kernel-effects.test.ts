/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { reconcileCssLinks, handleRuntimeActions } from "./kernel-effects"
import { Effect } from "@/types/kernel-effect"

function cssLinkIds(): string[] {
  return Array.from(
    document.querySelectorAll('link[id^="dot-agent-css:"]')
  ).map(link => link.id)
}

beforeEach(() => {
  document.head.innerHTML = ""
})

describe("reconcileCssLinks", () => {
  it("adds a link for each desired stylesheet", () => {
    reconcileCssLinks(["theme.css", "highlight.css"])
    expect(cssLinkIds().sort()).toEqual(
      ["dot-agent-css:highlight.css", "dot-agent-css:theme.css"].sort()
    )
  })

  it("removes a link that is no longer desired", () => {
    reconcileCssLinks(["theme.css", "highlight.css"])
    reconcileCssLinks(["theme.css"])
    expect(cssLinkIds()).toEqual(["dot-agent-css:theme.css"])
  })

  it("removes every link when the desired set is empty (the leak-fix case)", () => {
    reconcileCssLinks(["theme.css"])
    reconcileCssLinks([])
    expect(cssLinkIds()).toEqual([])
  })

  it("does not duplicate a link that is already present", () => {
    reconcileCssLinks(["theme.css"])
    reconcileCssLinks(["theme.css"])
    expect(cssLinkIds()).toEqual(["dot-agent-css:theme.css"])
  })

  it("leaves unrelated <head> content untouched", () => {
    const style = document.createElement("style")
    style.id = "not-a-dot-agent-link"
    document.head.appendChild(style)

    reconcileCssLinks(["theme.css"])

    expect(document.getElementById("not-a-dot-agent-link")).not.toBeNull()
  })
})

describe("handleRuntimeActions", () => {
  it("dispatches a known run_script target as its runtime action", () => {
    const listener = jest.fn()
    window.addEventListener("chat:models-selector-open", listener)

    const effects: Effect[] = [
      { type: "run_script", target: "chat:models-selector-open", parameters: null, silent: false }
    ]
    handleRuntimeActions(effects)

    window.removeEventListener("chat:models-selector-open", listener)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("ignores non-run_script effects", () => {
    expect(() =>
      handleRuntimeActions([
        { type: "apply_css", value: "theme.css" },
        { type: "goal", text: "x" }
      ])
    ).not.toThrow()
  })

  it("is a no-op for null/undefined/non-array input", () => {
    expect(() => handleRuntimeActions(null)).not.toThrow()
    expect(() => handleRuntimeActions(undefined)).not.toThrow()
  })
})
