/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

export interface SidebarAutoCollapseInput {
  totalWidth: number
  left: boolean
  right: boolean
  leftWidth: number
  rightWidth: number
  centerMinWidth: number
  autoCollapsedLeft: boolean
  autoCollapsedRight: boolean
}

export interface SidebarAutoCollapseResult {
  left: boolean
  right: boolean
  autoCollapsedLeft: boolean
  autoCollapsedRight: boolean
}

/**
 * Pure decision function for the dashboard's auto-collapse behavior: when the
 * center panel would drop below `centerMinWidth`, hide the left sidebar
 * first, then the right. When space is recovered, restore whichever of those
 * this function itself hid, right first then left, only if doing so still
 * leaves centerMinWidth. Sidebars closed by the user (autoCollapsedLeft/Right
 * false) are never touched.
 */
export function computeSidebarVisibility(
  input: SidebarAutoCollapseInput
): SidebarAutoCollapseResult {
  const { totalWidth, leftWidth, rightWidth, centerMinWidth } = input
  let { left, right, autoCollapsedLeft, autoCollapsedRight } = input

  const usedWidth = (left ? leftWidth : 0) + (right ? rightWidth : 0)

  if (totalWidth - usedWidth < centerMinWidth) {
    if (left) {
      left = false
      autoCollapsedLeft = true
    } else if (right) {
      right = false
      autoCollapsedRight = true
    }
    return { left, right, autoCollapsedLeft, autoCollapsedRight }
  }

  if (
    autoCollapsedRight &&
    !right &&
    totalWidth - (left ? leftWidth : 0) - rightWidth >= centerMinWidth
  ) {
    right = true
    autoCollapsedRight = false
    return { left, right, autoCollapsedLeft, autoCollapsedRight }
  }

  if (
    autoCollapsedLeft &&
    !left &&
    totalWidth - leftWidth - (right ? rightWidth : 0) >= centerMinWidth
  ) {
    left = true
    autoCollapsedLeft = false
  }

  return { left, right, autoCollapsedLeft, autoCollapsedRight }
}
