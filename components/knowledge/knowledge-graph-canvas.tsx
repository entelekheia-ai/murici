/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

"use client"

import { FC, useEffect, useRef, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Network } from "vis-network"
import type { Node, Edge, Options } from "vis-network"
import { KnowledgeRecord } from "@/types/knowledge"
import { Tables } from "@/types/database"
import { KnowledgePreviewModal } from "./knowledge-preview-modal"

const PALETTE = [
  "#9b7db8", "#5a9e94", "#6b9ec4", "#c4a55a",
  "#c47a5a", "#7aac6b", "#b85a7a", "#8a7db8", "#5a8e6b",
]

function cssVar(name: string): string {
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return `hsl(${val})`
}

function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function truncate(s: string | undefined, max: number): string {
  if (!s) return "Conversa"
  return s.length > max ? s.slice(0, max) + "…" : s
}

// Organic canopy: semantic influence area, not a tight hull.
// hub = domain center; leaves = actual vis.js positions of child nodes.
function drawCanopy(
  ctx: CanvasRenderingContext2D,
  hub: { x: number; y: number },
  leaves: { x: number; y: number }[],
  color: string
) {
  const MIN_R = 120
  const cx = hub.x, cy = hub.y
  // Outward expansion scales with cluster density: 45–80px
  const expand = Math.max(45, Math.min(80, 45 + leaves.length * 3))

  let pts: { x: number; y: number }[]

  if (leaves.length <= 2) {
    // Small cluster: generate 10-point organic ring so it never looks like a wedge
    pts = Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2
      const r = MIN_R * (1 + 0.18 * Math.abs(Math.sin(i * 2.17 + 1)))
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
    })
  } else {
    // Expand each leaf outward from hub, enforce minimum radius, sort by angle
    const expanded = leaves
      .map(p => {
        const dx = p.x - cx, dy = p.y - cy
        const d = Math.hypot(dx, dy)
        if (d < 1) return null
        const r = Math.max(d + expand, MIN_R)
        return { x: cx + (dx / d) * r, y: cy + (dy / d) * r }
      })
      .filter((p): p is { x: number; y: number } => p !== null)
      .sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))

    pts = expanded.length >= 3 ? expanded : Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2
      const r = MIN_R * (1 + 0.15 * Math.abs(Math.sin(i * 2.17 + 1)))
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
    })
  }

  // Smooth closed cubic Bézier via Catmull-Rom → cubic conversion
  const n = pts.length
  const tension = 0.22
  ctx.save()
  ctx.globalAlpha = 0.11
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    const cp1x = p1.x + (p2.x - p0.x) * tension
    const cp1y = p1.y + (p2.y - p0.y) * tension
    const cp2x = p2.x - (p3.x - p1.x) * tension
    const cp2y = p2.y - (p3.y - p1.y) * tension
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

interface Props {
  knowledge: KnowledgeRecord[]
  chats: Tables<"chats">[]
}

interface NodePreview {
  record: KnowledgeRecord
  chatName: string
}

export const KnowledgeGraphCanvas: FC<Props> = ({ knowledge, chats }) => {
  const router = useRouter()
  const params = useParams()
  const locale = (params?.locale as string) || "local"
  const workspaceid = (params?.workspaceid as string) || "local"

  const containerRef = useRef<HTMLDivElement>(null)
  const networkRef = useRef<Network | null>(null)
  const [preview, setPreview] = useState<NodePreview | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const fg = cssVar("--foreground")
    const mutedFg = cssVar("--muted-foreground")

    const chatMap = new Map(chats.map(c => [c.id, c]))
    const involvedChatIds = Array.from(new Set(knowledge.map(k => k.originConversationId)))
    const convColor = new Map(involvedChatIds.map((id, i) => [id, PALETTE[i % PALETTE.length]]))

    const byConv = new Map<string, KnowledgeRecord[]>()
    knowledge.forEach(k => {
      const arr = byConv.get(k.originConversationId) ?? []
      arr.push(k); byConv.set(k.originConversationId, arr)
    })

    // Pre-place hubs close together — centralGravity will keep the garden compact
    const initR = Math.max(100, involvedChatIds.length * 20)
    const hubInitPos = new Map(
      involvedChatIds.map((id, i) => {
        const a = (i / involvedChatIds.length) * 2 * Math.PI - Math.PI / 2
        return [id, { x: Math.round(initR * Math.cos(a)), y: Math.round(initR * Math.sin(a)) }]
      })
    )

    // Domain hubs — heavy but NOT fixed: global gravity can move them
    const convNodes = involvedChatIds.map(chatId => {
      const chat = chatMap.get(chatId)
      const color = convColor.get(chatId)!
      const { x, y } = hubInitPos.get(chatId)!
      return {
        id: `conv-${chatId}`,
        label: truncate(chat?.name, 20),
        shape: "dot" as const,
        size: 22,
        x, y,
        mass: 10,   // heavy = stable center within cluster, moved only by global gravity
        color: {
          background: hexAlpha(color, 0.2),
          border: color,
          highlight: { background: hexAlpha(color, 0.35), border: color },
          hover: { background: hexAlpha(color, 0.3), border: color }
        },
        font: { color: fg, size: 12, bold: true },
        borderWidth: 2.5
      }
    })

    // Leaf nodes — pre-placed radially around their hub
    const knowledgeNodes = knowledge.map(k => {
      const color = convColor.get(k.originConversationId)!
      const hub = hubInitPos.get(k.originConversationId)!
      const leaves = byConv.get(k.originConversationId) ?? []
      const idx = leaves.indexOf(k)
      const angle = (idx / Math.max(leaves.length, 1)) * 2 * Math.PI
      const r = 60 + (idx % 3) * 14  // pre-place tight around hub
      return {
        id: `know-${k.id}`,
        label: truncate(k.title, 26),
        shape: "square" as const,
        size: 8,
        x: Math.round(hub.x + r * Math.cos(angle)),
        y: Math.round(hub.y + r * Math.sin(angle)),
        mass: 1,
        color: {
          background: hexAlpha(color, 0.3),
          border: color,
          highlight: { background: hexAlpha(color, 0.55), border: color },
          hover: { background: hexAlpha(color, 0.45), border: color }
        },
        font: { color: mutedFg, size: 10 },
        borderWidth: 1.5
      }
    })

    // Intra-domain edges: short spring keeps leaves close to their hub
    const intraEdges = knowledge.map(k => ({
      id: `intra-${k.id}`,
      from: `know-${k.id}`,
      to: `conv-${k.originConversationId}`,
      color: { color: convColor.get(k.originConversationId)!, opacity: 0.22 },
      width: 1,
      length: 80
    }))

    const options: Options = {
      physics: {
        solver: "forceAtlas2Based",
        forceAtlas2Based: {
          gravitationalConstant: -55,  // repulsion keeps clusters from merging
          centralGravity: 0.06,        // stronger pull keeps all domains near canvas center
          springLength: 65,            // shorter spring = leaves stay close to hub
          springConstant: 0.12,        // firmer spring so hub and leaves move together
          damping: 0.6,
          avoidOverlap: 1.0
        },
        stabilization: { enabled: true, iterations: 500, updateInterval: 10 },
        minVelocity: 0.5
      },
      nodes: { shadow: false },
      edges: {
        smooth: { enabled: true, type: "continuous", roundness: 0.4 }
      },
      interaction: {
        hover: true,
        tooltipDelay: 80,
        hideEdgesOnDrag: true
      }
    }

    networkRef.current?.destroy()

    const network = new Network(
      containerRef.current,
      {
        nodes: [...convNodes, ...knowledgeNodes] as Node[],
        edges: intraEdges as Edge[]
      },
      options
    )
    networkRef.current = network

    // Canopy drawn from hub center + actual leaf positions each frame
    network.on("beforeDrawing", (ctx: CanvasRenderingContext2D) => {
      involvedChatIds.forEach(convId => {
        let hubP: { x: number; y: number } | null = null
        try { hubP = network.getPosition(`conv-${convId}`) } catch { return }
        if (!hubP) return

        const leafPts: { x: number; y: number }[] = []
        ;(byConv.get(convId) ?? []).forEach(k => {
          try { leafPts.push(network.getPosition(`know-${k.id}`)) } catch { /* not yet placed */ }
        })
        drawCanopy(ctx, hubP, leafPts, convColor.get(convId)!)
      })
    })

    const stopPhysics = () => network.setOptions({ physics: { enabled: false } })
    network.once("stabilizationIterationsDone", stopPhysics)
    network.once("stabilized", stopPhysics)

    network.on("click", params => {
      if (params.nodes.length === 0) return
      const nodeId = params.nodes[0] as string
      if (nodeId.startsWith("conv-")) {
        router.push(`/${locale}/${workspaceid}/chat/${nodeId.replace("conv-", "")}`)
      } else if (nodeId.startsWith("know-")) {
        const record = knowledge.find(k => k.id === nodeId.replace("know-", ""))
        if (record) {
          const chat = chatMap.get(record.originConversationId)
          setPreview({ record, chatName: chat?.name || "Conversa" })
        }
      }
    })

    return () => {
      network.destroy()
      networkRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knowledge, chats])

  return (
    <div className="relative size-full">
      <div ref={containerRef} className="size-full" />
      {preview && (
        <KnowledgePreviewModal
          record={preview.record}
          chatName={preview.chatName}
          onClose={() => setPreview(null)}
          overlay="absolute"
        />
      )}
    </div>
  )
}
