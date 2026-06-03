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

import { FC } from "react"

interface GraphInfo {
  states: string[]
  transitions: Array<{ from: string; to: string; label: string }>
  current: string
}

interface StateGraphProps {
  graph: GraphInfo
  activeState: string
  visitedStates: Set<string>
}

const NODE_W = 130
const NODE_H = 36
const H_GAP = 28
const V_GAP = 64

function computeLayout(graph: GraphInfo) {
  const adj = new Map<string, string[]>()
  for (const s of graph.states) adj.set(s, [])
  for (const t of graph.transitions) adj.get(t.from)?.push(t.to)

  // BFS from first state to assign depth levels
  const levels = new Map<string, number>()
  const root = graph.states[0]
  if (!root)
    return {
      positions: new Map<string, { x: number; y: number }>(),
      svgW: 0,
      svgH: 0
    }

  const queue: string[] = [root]
  levels.set(root, 0)
  let head = 0
  while (head < queue.length) {
    const node = queue[head++]
    const level = levels.get(node)!
    for (const next of adj.get(node) || []) {
      if (!levels.has(next)) {
        levels.set(next, level + 1)
        queue.push(next)
      }
    }
  }
  // Unreachable states go to level max+1
  const maxReachable = Math.max(...[...levels.values()], 0)
  for (const s of graph.states) {
    if (!levels.has(s)) levels.set(s, maxReachable + 1)
  }

  // Group by level, preserving BFS order
  const byLevel = new Map<number, string[]>()
  for (const s of [
    ...queue,
    ...graph.states.filter(s => !levels.has(s) || levels.get(s)! > maxReachable)
  ]) {
    const l = levels.get(s)!
    if (!byLevel.has(l)) byLevel.set(l, [])
    if (!byLevel.get(l)!.includes(s)) byLevel.get(l)!.push(s)
  }

  const numLevels = Math.max(...[...byLevel.keys()]) + 1
  const maxPerLevel = Math.max(...[...byLevel.values()].map(v => v.length))
  const svgW = Math.max(maxPerLevel * (NODE_W + H_GAP) - H_GAP, NODE_W)

  const positions = new Map<string, { x: number; y: number }>()
  for (const [level, states] of byLevel) {
    const rowW = states.length * NODE_W + (states.length - 1) * H_GAP
    const startX = (svgW - rowW) / 2
    states.forEach((s, i) => {
      positions.set(s, {
        x: startX + i * (NODE_W + H_GAP),
        y: level * (NODE_H + V_GAP)
      })
    })
  }

  const svgH = numLevels * NODE_H + (numLevels - 1) * V_GAP
  return { positions, svgW, svgH }
}

export const StateGraph: FC<StateGraphProps> = ({
  graph,
  activeState,
  visitedStates
}) => {
  if (!graph?.states?.length) return null

  const { positions, svgW, svgH } = computeLayout(graph)
  const PAD = 12

  return (
    <svg
      width={svgW + PAD * 2}
      height={svgH + PAD * 2}
      viewBox={`${-PAD} ${-PAD} ${svgW + PAD * 2} ${svgH + PAD * 2}`}
      style={{ overflow: "visible" }}
    >
      <defs>
        <marker
          id="sg-arrow"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L0,6 L8,3 z" fill="#6b7280" />
        </marker>
      </defs>

      {/* Edges */}
      {graph.transitions.map((t, i) => {
        const from = positions.get(t.from)
        const to = positions.get(t.to)
        if (!from || !to) return null

        const x1 = from.x + NODE_W / 2
        const y1 = from.y + NODE_H
        const x2 = to.x + NODE_W / 2
        const y2 = to.y - 4 // stop before arrowhead

        const cpY = (y1 + y2) / 2
        const labelX = (x1 + x2) / 2
        const labelY = cpY - 4

        return (
          <g key={i}>
            <path
              d={`M${x1},${y1} C${x1},${cpY} ${x2},${cpY} ${x2},${y2}`}
              fill="none"
              stroke="#6b7280"
              strokeWidth={1.5}
              markerEnd="url(#sg-arrow)"
            />
            <text
              x={labelX}
              y={labelY}
              textAnchor="middle"
              fontSize={10}
              fill="#9ca3af"
              fontFamily="ui-monospace, monospace"
            >
              {t.label}
            </text>
          </g>
        )
      })}

      {/* Nodes */}
      {graph.states.map(s => {
        const pos = positions.get(s)
        if (!pos) return null

        const isActive = s === activeState
        const isVisited = visitedStates.has(s) && !isActive
        const fill = isActive ? "#7c3aed" : isVisited ? "#374151" : "#1f2937"
        const stroke = isActive ? "#4c1d95" : isVisited ? "#4b5563" : "#374151"
        const textFill = isActive
          ? "#ffffff"
          : isVisited
            ? "#9ca3af"
            : "#e5e7eb"

        return (
          <g key={s} transform={`translate(${pos.x},${pos.y})`}>
            <rect
              width={NODE_W}
              height={NODE_H}
              rx={6}
              fill={fill}
              stroke={stroke}
              strokeWidth={isActive ? 2 : 1}
            />
            <text
              x={NODE_W / 2}
              y={NODE_H / 2 + 4}
              textAnchor="middle"
              fontSize={12}
              fill={textFill}
              fontFamily="ui-monospace, monospace"
            >
              {s.length > 15 ? s.slice(0, 14) + "…" : s}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
