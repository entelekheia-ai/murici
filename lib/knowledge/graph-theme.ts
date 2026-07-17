/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

// Alta-tier: per-conversation identity (unchanged from the original canvas).
export const PALETTE = [
  "#9b7db8",
  "#5a9e94",
  "#6b9ec4",
  "#c4a55a",
  "#c47a5a",
  "#7aac6b",
  "#b85a7a",
  "#8a7db8",
  "#5a8e6b"
]

// Alta-tier when the "agent" lens is active — separate identity space so an
// agent and a conversation never collide, since only one of the two is ever
// on-screen as alta-tier at a time.
export const AGENT_PALETTE = [
  "#d99a2b",
  "#4f9d7c",
  "#7d6ab8",
  "#b8555a",
  "#3f8ab0",
  "#a67d3a",
  "#6a9e5a",
  "#9a5a94"
]

// Média-tier: fixed anchor color for artifact nodes. Never individual —
// identity of "which parent(s)" lives in the border gradient, not the fill.
export const MEDIUM_ANCHOR_COLOR = "#9a9488"

// Baixa-tier ("netos"): single flat color, no individual distinction.
export const LOW_TIER_COLOR = "#c4922a"

export function cssVar(name: string): string {
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return `hsl(${val})`
}

export function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
