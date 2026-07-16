/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { dispatchRuntimeAction, RUNTIME_ACTIONS } from "./runtime-actions"

describe("dispatchRuntimeAction", () => {
  it("dispatches a window CustomEvent named exactly after a known action", () => {
    const seen: string[] = []
    const listener = (e: Event) => seen.push(e.type)
    window.addEventListener("chat:models-selector-open", listener)

    dispatchRuntimeAction("chat:models-selector-open")

    window.removeEventListener("chat:models-selector-open", listener)
    expect(seen).toEqual(["chat:models-selector-open"])
  })

  it.each(RUNTIME_ACTIONS)("dispatches the known action %s", action => {
    const listener = jest.fn()
    window.addEventListener(action, listener)

    dispatchRuntimeAction(action)

    window.removeEventListener(action, listener)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("is a no-op for an unknown action (no event dispatched)", () => {
    const listener = jest.fn()
    window.addEventListener("chat:unknown-thing-open", listener)

    dispatchRuntimeAction("chat:unknown-thing-open")

    window.removeEventListener("chat:unknown-thing-open", listener)
    expect(listener).not.toHaveBeenCalled()
  })

  it("does not throw for an unknown action", () => {
    expect(() => dispatchRuntimeAction("totally:made-up")).not.toThrow()
  })
})
