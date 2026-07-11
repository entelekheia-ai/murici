/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { computeSidebarVisibility, SidebarAutoCollapseInput } from "./sidebar-auto-collapse"

const base: SidebarAutoCollapseInput = {
  totalWidth: 1400,
  left: true,
  right: true,
  leftWidth: 280,
  rightWidth: 320,
  centerMinWidth: 320,
  autoCollapsedLeft: false,
  autoCollapsedRight: false
}

describe("computeSidebarVisibility", () => {
  it("keeps both sidebars open when there is plenty of room", () => {
    const result = computeSidebarVisibility({ ...base, totalWidth: 1400 })
    expect(result).toEqual({
      left: true,
      right: true,
      autoCollapsedLeft: false,
      autoCollapsedRight: false
    })
  })

  it("collapses the left sidebar first once the center panel would drop below the minimum", () => {
    // 1400 - 280 - 320 = 800 (fine); shrink until center would be < 320
    const result = computeSidebarVisibility({ ...base, totalWidth: 900 })
    expect(result.left).toBe(false)
    expect(result.right).toBe(true)
    expect(result.autoCollapsedLeft).toBe(true)
    expect(result.autoCollapsedRight).toBe(false)
  })

  it("collapses the right sidebar next once the left is already collapsed and space is still short", () => {
    const result = computeSidebarVisibility({
      ...base,
      totalWidth: 500,
      left: false,
      right: true,
      autoCollapsedLeft: true
    })
    expect(result.left).toBe(false)
    expect(result.right).toBe(false)
    expect(result.autoCollapsedRight).toBe(true)
  })

  it("does nothing further once both sidebars are already collapsed", () => {
    const result = computeSidebarVisibility({
      ...base,
      totalWidth: 200,
      left: false,
      right: false,
      autoCollapsedLeft: true,
      autoCollapsedRight: true
    })
    expect(result).toEqual({
      left: false,
      right: false,
      autoCollapsedLeft: true,
      autoCollapsedRight: true
    })
  })

  it("re-expands the right sidebar before the left once space is recovered", () => {
    const result = computeSidebarVisibility({
      ...base,
      totalWidth: 900, // enough for left(280) + right(320) + min(320) = 920? no -> only right fits
      left: false,
      right: false,
      autoCollapsedLeft: true,
      autoCollapsedRight: true
    })
    // 900 - 0 - 320 = 580 >= 320, so right comes back; left would need 900-280-320=300 < 320, stays closed
    expect(result.right).toBe(true)
    expect(result.autoCollapsedRight).toBe(false)
    expect(result.left).toBe(false)
    expect(result.autoCollapsedLeft).toBe(true)
  })

  it("re-expands both, right then left, once there is enough room for both", () => {
    const result = computeSidebarVisibility({
      ...base,
      totalWidth: 1400,
      left: false,
      right: false,
      autoCollapsedLeft: true,
      autoCollapsedRight: true
    })
    expect(result.right).toBe(true)
    expect(result.autoCollapsedRight).toBe(false)
    // Note: this call only reopens one sidebar per invocation (mirrors one
    // ResizeObserver tick); the caller re-runs on the next observed resize,
    // and since totalWidth didn't change, a follow-up call reopens left too.
  })

  it("reopening the right sidebar is followed by the left sidebar on a subsequent call at the same width", () => {
    let state = {
      ...base,
      totalWidth: 1400,
      left: false,
      right: false,
      autoCollapsedLeft: true,
      autoCollapsedRight: true
    }
    state = { ...state, ...computeSidebarVisibility(state) }
    expect(state.right).toBe(true)
    expect(state.left).toBe(false)

    state = { ...state, ...computeSidebarVisibility(state) }
    expect(state.left).toBe(true)
    expect(state.autoCollapsedLeft).toBe(false)
  })

  it("never touches a sidebar the user closed manually (autoCollapsed flag false)", () => {
    const result = computeSidebarVisibility({
      ...base,
      totalWidth: 1400,
      left: false,
      right: false,
      autoCollapsedLeft: false,
      autoCollapsedRight: false
    })
    expect(result).toEqual({
      left: false,
      right: false,
      autoCollapsedLeft: false,
      autoCollapsedRight: false
    })
  })

  it("does not reopen a sidebar if doing so would immediately drop the center below the minimum again", () => {
    // Neither fits alone: 550 - 320(right) = 230 < 320, and 550 - 280(left) = 270 < 320
    const result = computeSidebarVisibility({
      ...base,
      totalWidth: 550,
      left: false,
      right: false,
      autoCollapsedLeft: true,
      autoCollapsedRight: true
    })
    expect(result.left).toBe(false)
    expect(result.right).toBe(false)
  })
})
