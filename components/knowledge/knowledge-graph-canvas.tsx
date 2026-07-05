/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

"use client"

import { FC, useEffect, useRef, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Network } from "vis-network"
import type { Node, Edge, Options } from "vis-network"
import { DataSet } from "vis-data"
import { KnowledgeRecord } from "@/types/knowledge"
import { Tables } from "@/types/database"
import { AgentBundleRecord } from "@/lib/local-db/schema"
import { Button } from "@/components/ui/button"
import { KnowledgePreviewModal } from "./knowledge-preview-modal"
import { PALETTE, AGENT_PALETTE, MEDIUM_ANCHOR_COLOR, LOW_TIER_COLOR, cssVar } from "@/lib/knowledge/graph-theme"
import { buildAgentLayer, countParentsByArtifact } from "@/lib/knowledge/agent-layer"

// Gravitational lens: which node type is alta-tier (canopy + individual
// color), and how much mass each type gets. Not 3 separate physics setups —
// one priority table, swapped on click. "semantic" is reserved for when
// RFC-0004 clustering lands (grupo takes alta, conversa+agente both drop to
// baixa) — not implemented yet, just documented as the next row.
type Lens = "default" | "chat" | "agent"

const LENS_MASS: Record<Lens, { conv: number; know: number; agent: number }> = {
  default: { conv: 10, know: 1, agent: 2 },
  chat: { conv: 10, know: 1, agent: 2 },
  agent: { conv: 2, know: 1, agent: 10 }
}

// Tier1↔tier2 is always solid, tier2↔tier3 always light — and which
// structural edge plays which role flips with the lens, since which type
// IS tier1/2/3 flips too. Tier1↔tier3 is never drawn directly:
//   chat lens:  chat(1)-conhecimento(2) solid [intra-*], chat(1)-agente(3) light [agent-conv-*], conhecimento-agente not drawn
//   agent lens: agente(1)-conhecimento(2) solid [agent-know-*], conhecimento(2)-chat(3) light [intra-*], agente-chat not drawn
const SOLID_OPACITY = 1
const LIGHT_OPACITY = 0.15

// Média-tier border: fixed anchor fill everywhere, but the ring around it
// resolves identity — 1 parent = solid color, N parents = organic conic
// gradient blended at each parent's real live angle, 0 = anchor solid.
function drawMediumBorder(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  radius: number,
  parents: Array<{ x: number; y: number; color: string }>
) {
  if (parents.length === 0) {
    ctx.strokeStyle = MEDIUM_ANCHOR_COLOR
  } else if (parents.length === 1) {
    ctx.strokeStyle = parents[0].color
  } else {
    const withAngle = parents
      .map(p => ({
        color: p.color,
        angle: Math.atan2(p.y - center.y, p.x - center.x)
      }))
      .sort((a, b) => a.angle - b.angle)

    const startAngle = withAngle[0].angle
    const grd = ctx.createConicGradient(startAngle, center.x, center.y)
    withAngle.forEach(p => {
      const rel = ((p.angle - startAngle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)
      grd.addColorStop(rel, p.color)
    })
    grd.addColorStop(1, withAngle[0].color) // close the loop, no hard seam
    ctx.strokeStyle = grd
  }
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2)
  ctx.stroke()
}

function truncate(s: string | undefined, max: number): string {
  if (!s) return "Conversa"
  return s.length > max ? s.slice(0, max) + "…" : s
}

function nodeKind(id: string): string {
  if (id.startsWith("conv-")) return "chat"
  if (id.startsWith("know-")) return "conhecimento"
  if (id.startsWith("agent-")) return "agente"
  return ""
}

// Andrew's monotone chain — real convex hull, not a hub-outward projection.
// Guarantees every input point ends up inside (or on) the returned hull,
// regardless of how the points are angularly distributed around the hub.
function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

  const lower: { x: number; y: number }[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: { x: number; y: number }[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  upper.pop(); lower.pop()
  return lower.concat(upper)
}

function organicRing(cx: number, cy: number, r: number): { x: number; y: number }[] {
  return Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2
    const rr = r * (1 + 0.18 * Math.abs(Math.sin(i * 2.17 + 1)))
    return { x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) }
  })
}

// Organic canopy: hugs the actual hub+leaves cluster (real convex hull,
// padded outward from its own centroid), not a fixed-radius projection from
// the hub — that used to pinch into a thin sliver whenever leaves clustered
// within a narrow arc instead of surrounding the hub on all sides.
function drawCanopy(
  ctx: CanvasRenderingContext2D,
  hub: { x: number; y: number },
  leaves: { x: number; y: number }[],
  color: string
) {
  const FALLBACK_R = 60
  const allPoints = [hub, ...leaves]
  // Outward padding scales with cluster density: 30–60px
  const expand = Math.max(30, Math.min(60, 24 + leaves.length * 3))

  let pts: { x: number; y: number }[]
  const hull = allPoints.length >= 3 ? convexHull(allPoints) : []

  if (hull.length < 3) {
    // Too few points, or collinear — organic ring around their centroid
    const cx = allPoints.reduce((s, p) => s + p.x, 0) / allPoints.length
    const cy = allPoints.reduce((s, p) => s + p.y, 0) / allPoints.length
    pts = organicRing(cx, cy, FALLBACK_R)
  } else {
    const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length
    const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length
    pts = hull.map(p => {
      const dx = p.x - cx, dy = p.y - cy
      const d = Math.hypot(dx, dy)
      if (d < 1) return { x: p.x, y: p.y }
      return { x: p.x + (dx / d) * expand, y: p.y + (dy / d) * expand }
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
  agentBundles: AgentBundleRecord[]
}

interface NodePreview {
  record: KnowledgeRecord
  chatName: string
}

interface AgentPreview {
  agentId: string
  name: string
  conversationIds: string[]
  artifactIds: string[]
}

export const KnowledgeGraphCanvas: FC<Props> = ({ knowledge, chats, agentBundles }) => {
  const router = useRouter()
  const params = useParams()
  const locale = (params?.locale as string) || "local"
  const workspaceid = (params?.workspaceid as string) || "local"

  const containerRef = useRef<HTMLDivElement>(null)
  const networkRef = useRef<Network | null>(null)
  const [preview, setPreview] = useState<NodePreview | null>(null)
  const [agentPreview, setAgentPreview] = useState<AgentPreview | null>(null)
  const [activeLens, setActiveLens] = useState<Lens>("default")
  const applyLensRef = useRef<(lens: Lens) => void>(() => {})

  useEffect(() => {
    if (!containerRef.current) return
    setActiveLens("default") // network rebuilds fresh below — keep the UI in sync

    const fg = cssVar("--foreground")
    const mutedFg = cssVar("--muted-foreground")

    const chatMap = new Map(chats.map(c => [c.id, c]))
    // Union of conversations with artifacts AND conversations an agent was
    // ever loaded into (agentBundles) — an agent can touch a conversation
    // that never produced a single artifact. Without this, agent-conv
    // edges point at conv-* ids with no matching node, network.getPosition()
    // throws for those, and the agent's canopy silently loses that leaf.
    const involvedChatIds = Array.from(new Set([
      ...knowledge.map(k => k.originConversationId),
      ...agentBundles.map(b => b.conversationId)
    ]))
    const convColor = new Map(involvedChatIds.map((id, i) => [id, PALETTE[i % PALETTE.length]]))

    const byConv = new Map<string, KnowledgeRecord[]>()
    knowledge.forEach(k => {
      const arr = byConv.get(k.originConversationId) ?? []
      arr.push(k); byConv.set(k.originConversationId, arr)
    })

    // Point-like sizes across all three tiers — circles read as a garden of
    // dots, not oversized shapes. ~5px diameter at 100% zoom is the target;
    // vis-network's "size" for shape "dot" is roughly the radius in px.
    const CONV_SIZE = 6
    const KNOW_SIZE = 3
    const AGENT_BASE_SIZE = 3
    const AGENT_SIZE_STEP = 0.4
    const AGENT_MAX_SIZE = 6

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
        size: CONV_SIZE,
        x, y,
        mass: 10,   // heavy = stable center within cluster, moved only by global gravity
        color: {
          background: color,
          border: color,
          highlight: { background: color, border: color },
          hover: { background: color, border: color }
        },
        font: { color: fg, size: 12, bold: true },
        borderWidth: 1
      }
    })

    // Leaf nodes — pre-placed radially around their hub
    const knowledgeNodes = knowledge.map(k => {
      const hub = hubInitPos.get(k.originConversationId)!
      const leaves = byConv.get(k.originConversationId) ?? []
      const idx = leaves.indexOf(k)
      const angle = (idx / Math.max(leaves.length, 1)) * 2 * Math.PI
      const r = 60 + (idx % 3) * 14  // pre-place tight around hub
      // The intra-* edge below is scoped to exactly this one conversation —
      // its gradient endpoint should track THAT relationship's color, not
      // the flat anchor tone (which is only about the fill, and about the
      // ring's *aggregate* multi-parent case, not this specific edge).
      const convBorderColor = convColor.get(k.originConversationId)!
      return {
        id: `know-${k.id}`,
        label: truncate(k.title, 26),
        shape: "dot" as const,
        size: KNOW_SIZE,
        x: Math.round(hub.x + r * Math.cos(angle)),
        y: Math.round(hub.y + r * Math.sin(angle)),
        mass: 1,
        // Média-tier: fixed anchor fill, no individual color. borderWidth 0
        // keeps the native ring invisible (the real border is a conic
        // gradient drawn manually in "afterDrawing", see drawMediumBorder).
        color: {
          background: MEDIUM_ANCHOR_COLOR,
          border: convBorderColor,
          highlight: { background: MEDIUM_ANCHOR_COLOR, border: convBorderColor },
          hover: { background: MEDIUM_ANCHOR_COLOR, border: convBorderColor }
        },
        font: { color: mutedFg, size: 10 },
        borderWidth: 0
      }
    })

    // Agent layer — deduped globally by agentId (buildAgentLayer), not per
    // conversation. Sorted explicitly by agentId: IndexedDB/Map/Set
    // iteration order isn't a determinism guarantee on its own, and this
    // canvas's whole geographic-stability premise depends on no randomness
    // creeping into palette-index/initial-position assignment.
    const agentLayer = buildAgentLayer(knowledge, agentBundles)
    const sortedAgents = Array.from(agentLayer.values()).sort((a, b) =>
      a.agentId.localeCompare(b.agentId)
    )
    // Own identity space, only used when the "agent" lens promotes agents to
    // alta-tier — in default/chat lens agents render flat (LOW_TIER_COLOR).
    const agentColor = new Map(
      sortedAgents.map((agent, i) => [agent.agentId, AGENT_PALETTE[i % AGENT_PALETTE.length]])
    )
    // agentBundles is keyPath=conversationId — a conversation has at most 1
    // currently-loaded agent, never N. So a conv's baixa-tier color (agent
    // lens) is never actually ambiguous — show that one agent's color
    // instead of a flat generic tone reserved for genuine ambiguity.
    const convAgentId = new Map(agentBundles.map(b => [b.conversationId, b.aboutme.id]))
    let currentLens: Lens = "default"
    let hoveredNodeId: string | null = null

    const agentInitPos = new Map(
      sortedAgents.map((agent, i) => {
        const hubPositions = Array.from(agent.conversationIds)
          .map(id => hubInitPos.get(id))
          .filter((p): p is { x: number; y: number } => !!p)
        if (hubPositions.length > 0) {
          const x = hubPositions.reduce((sum, p) => sum + p.x, 0) / hubPositions.length
          const y = hubPositions.reduce((sum, p) => sum + p.y, 0) / hubPositions.length
          return [agent.agentId, { x: Math.round(x), y: Math.round(y) }]
        }
        // No conversation touched yet (artifact-only agentRuns) — park on an
        // outer ring, deterministic by sorted index.
        const a = (i / Math.max(sortedAgents.length, 1)) * 2 * Math.PI + Math.PI / 4
        const r = initR + 140
        return [agent.agentId, { x: Math.round(r * Math.cos(a)), y: Math.round(r * Math.sin(a)) }]
      })
    )

    // Baixa-tier ("netos") in the default lens — flat only when genuinely
    // ambiguous (2+ conversations); an agent tied to exactly 1 conversation
    // shows that conversation's own color instead, same rule the médio
    // border already uses for its 1-parent case.
    const agentNodes = sortedAgents.map(agent => {
      const { x, y } = agentInitPos.get(agent.agentId)!
      const size = Math.min(AGENT_MAX_SIZE, AGENT_BASE_SIZE + agent.interactionCount * AGENT_SIZE_STEP)
      const soloConvId = agent.conversationIds.size === 1 ? [...agent.conversationIds][0] : null
      const color = (soloConvId && convColor.get(soloConvId)) || LOW_TIER_COLOR
      return {
        id: `agent-${agent.agentId}`,
        label: truncate(agent.name, 20),
        shape: "dot" as const,
        size,
        x, y,
        mass: 2, // baixa-tier: light — drifts toward whatever it touches most
        color: {
          background: color,
          border: color,
          highlight: { background: color, border: color },
          hover: { background: color, border: color }
        },
        font: { color: mutedFg, size: 10 },
        borderWidth: 0.75
      }
    })

    // Agent edges — netos: flat, thin, light. Not the gradient treatment
    // alta→médio edges get, since agents carry no individual color here.
    // Dynamic like intra-*, kept thin/light like before (opacity still
    // applies on top of the inherited gradient) — so the edge always tracks
    // whatever color each endpoint currently holds per the active lens,
    // instead of being pinned to a flat tone regardless of lens.
    // Initial state matches the default/chat lens: chat↔agente is the
    // visible (light) edge, agente↔conhecimento doesn't exist yet (hidden)
    // — applyLens flips both when the lens switches.
    const agentEdges = sortedAgents.flatMap(agent => [
      ...Array.from(agent.conversationIds).map(convId => ({
        id: `agent-conv-${agent.agentId}-${convId}`,
        from: `agent-${agent.agentId}`,
        to: `conv-${convId}`,
        color: { inherit: "both" as const, opacity: LIGHT_OPACITY },
        width: 0.75,
        length: 120
      })),
      ...Array.from(agent.artifactIds).map(artifactId => ({
        id: `agent-know-${agent.agentId}-${artifactId}`,
        from: `agent-${agent.agentId}`,
        to: `know-${artifactId}`,
        hidden: true,
        color: { inherit: "both" as const, opacity: SOLID_OPACITY },
        width: 1,
        length: 100
      }))
    ])

    // Distinct parents per artifact — feeds the médio border gradient.
    // Conversation parents keep their individual palette color; agent
    // parents (baixa-tier, colorless by design) all resolve to the same
    // flat LOW_TIER_COLOR, so multiple agents don't fake an individual hue.
    const artifactParentIds = countParentsByArtifact(knowledge, agentBundles)

    // Intra-domain edges: short spring keeps leaves close to their hub.
    // Native gradient (alta mancha → médio borda), confirmed live 2-stop
    // support in vis-network's own source, not an assumption.
    const intraEdges = knowledge.map(k => ({
      id: `intra-${k.id}`,
      from: `know-${k.id}`,
      to: `conv-${k.originConversationId}`,
      color: { inherit: "both" as const, opacity: SOLID_OPACITY },
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

    const nodesDataSet = new DataSet<Node>(
      [...convNodes, ...knowledgeNodes, ...agentNodes] as Node[]
    )
    const edgesDataSet = new DataSet<Edge>([...intraEdges, ...agentEdges] as Edge[])

    const network = new Network(
      containerRef.current,
      { nodes: nodesDataSet, edges: edgesDataSet },
      options
    )
    networkRef.current = network

    // Debug hook: inspect live node/edge state from DevTools console.
    // Harmless in a local-first desktop app — remove once the lens/canopy
    // bugs are sorted out if it bothers anyone.
    if (typeof window !== "undefined") {
      ;(window as any).__muriciGraph = { network, nodes: nodesDataSet, edges: edgesDataSet }
    }

    // Canopy drawn from hub center + actual leaf positions each frame.
    // Alta-tier is whichever type the active lens promotes — same
    // drawCanopy(), different hub/leaves fed in.
    network.on("beforeDrawing", (ctx: CanvasRenderingContext2D) => {
      if (currentLens === "agent") {
        // Média-tier (artefatos) is a 3rd level here — it exists and stays
        // visible, but doesn't shape the agent's canopy. The agent's direct
        // children for hull purposes are the conversations it touched
        // (agentBundles), same relationship conv's own canopy used against
        // knowledge in the other lenses.
        sortedAgents.forEach(agent => {
          let hubP: { x: number; y: number } | null = null
          try { hubP = network.getPosition(`agent-${agent.agentId}`) } catch { return }
          if (!hubP) return

          const leafPts: { x: number; y: number }[] = []
          agent.conversationIds.forEach(id => {
            try { leafPts.push(network.getPosition(`conv-${id}`)) } catch { /* not yet placed */ }
          })
          drawCanopy(ctx, hubP, leafPts, agentColor.get(agent.agentId)!)
        })
        return
      }

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

    // Média-tier border ring: drawn after native node rendering so it sits
    // on top of the fixed anchor fill. 1 parent = solid ring (degenerate
    // case, no visual regression from before agents existed); N parents =
    // organic conic gradient, one stop per live parent.
    network.on("afterDrawing", (ctx: CanvasRenderingContext2D) => {
      knowledge.forEach(k => {
        let center: { x: number; y: number } | null = null
        try { center = network.getPosition(`know-${k.id}`) } catch { return }
        if (!center) return

        const ids = artifactParentIds.get(k.id) ?? []
        const parents = ids.flatMap(id => {
          let pos: { x: number; y: number } | null = null
          try { pos = network.getPosition(id) } catch { return [] }
          if (!pos) return []
          // Alta-tier parents carry their individual color; whichever type
          // the active lens demotes to baixa-tier goes flat, no exceptions.
          let color: string
          if (id.startsWith("conv-")) {
            color = currentLens === "agent" ? LOW_TIER_COLOR : convColor.get(id.replace("conv-", ""))!
          } else {
            color = currentLens === "agent" ? (agentColor.get(id.replace("agent-", "")) ?? LOW_TIER_COLOR) : LOW_TIER_COLOR
          }
          return [{ x: pos.x, y: pos.y, color }]
        })
        drawMediumBorder(ctx, center, KNOW_SIZE, parents)
      })

      // Hover subtitle: node kind (chat/conhecimento/agente), lighter and
      // smaller than the node's own label, drawn just below it.
      if (hoveredNodeId) {
        let pos: { x: number; y: number } | null = null
        try { pos = network.getPosition(hoveredNodeId) } catch { pos = null }
        const kind = pos ? nodeKind(hoveredNodeId) : ""
        if (pos && kind) {
          ctx.save()
          ctx.font = "9px sans-serif"
          ctx.fillStyle = mutedFg
          ctx.globalAlpha = 0.65
          ctx.textAlign = "center"
          ctx.fillText(kind, pos.x, pos.y + 32)
          ctx.restore()
        }
      }
    })

    network.on("hoverNode", params => { hoveredNodeId = params.node })
    network.on("blurNode", () => { hoveredNodeId = null })

    const stopPhysics = () => network.setOptions({ physics: { enabled: false } })
    network.once("stabilizationIterationsDone", stopPhysics)
    network.once("stabilized", stopPhysics)

    // Re-weights mass + recolors by node type per the active lens — never
    // removes a node from the dataset, so the default layout is always
    // recoverable (geographic stability across reloads depends on that).
    const applyLens = (lens: Lens) => {
      currentLens = lens
      const mass = LENS_MASS[lens]
      const nodeUpdates: Array<Record<string, unknown>> = []

      involvedChatIds.forEach(convId => {
        const isAlta = lens !== "agent"
        // Baixa here is never actually ambiguous (agentBundles ties a conv
        // to at most 1 agent) — show that one agent's color if it has one,
        // flat only for a conv with no agent at all.
        const linkedAgentId = convAgentId.get(convId)
        const color = isAlta
          ? convColor.get(convId)!
          : (linkedAgentId && agentColor.get(linkedAgentId)) || LOW_TIER_COLOR
        nodeUpdates.push({
          id: `conv-${convId}`,
          mass: mass.conv,
          color: {
            background: color,
            border: color,
            highlight: { background: color, border: color },
            hover: { background: color, border: color }
          }
        })
      })

      sortedAgents.forEach(agent => {
        const isAlta = lens === "agent"
        // Symmetric case: an agent with exactly 1 conversation is just as
        // unambiguous as a conv with exactly 1 agent — show that
        // conversation's color instead of flat. 2+ conversations is genuine
        // ambiguity (which one would it even show?), stays flat.
        const soloConvId = agent.conversationIds.size === 1 ? [...agent.conversationIds][0] : null
        const color = isAlta
          ? agentColor.get(agent.agentId)!
          : (soloConvId && convColor.get(soloConvId)) || LOW_TIER_COLOR
        nodeUpdates.push({
          id: `agent-${agent.agentId}`,
          mass: mass.agent,
          color: {
            background: color,
            border: color,
            highlight: { background: color, border: color },
            hover: { background: color, border: color }
          }
        })
      })

      knowledge.forEach(k => {
        // The intra-* edge's gradient endpoint (native color.border) is
        // scoped to this one conversation — it must track whatever color
        // that conversation currently displays as, not a value frozen at
        // node-creation time. DataSet.update() replaces the whole `color`
        // object per node (no deep merge), so background has to be
        // restated here too or it'd be wiped by this update.
        const borderColor = lens === "agent" ? LOW_TIER_COLOR : convColor.get(k.originConversationId)!
        nodeUpdates.push({
          id: `know-${k.id}`,
          mass: mass.know,
          color: {
            background: MEDIUM_ANCHOR_COLOR,
            border: borderColor,
            highlight: { background: MEDIUM_ANCHOR_COLOR, border: borderColor },
            hover: { background: MEDIUM_ANCHOR_COLOR, border: borderColor }
          }
        })
      })

      nodesDataSet.update(nodeUpdates)

      // Tier1↔tier2 solid, tier2↔tier3 light, tier1↔tier3 never drawn.
      // Which structural edge plays which role flips with the lens.
      const edgeUpdates: Array<Record<string, unknown>> = []
      knowledge.forEach(k => {
        edgeUpdates.push({
          id: `intra-${k.id}`,
          hidden: false,
          color: { inherit: "both", opacity: lens === "agent" ? LIGHT_OPACITY : SOLID_OPACITY }
        })
      })
      sortedAgents.forEach(agent => {
        agent.conversationIds.forEach(convId => {
          edgeUpdates.push({
            id: `agent-conv-${agent.agentId}-${convId}`,
            hidden: lens === "agent",
            color: { inherit: "both", opacity: LIGHT_OPACITY }
          })
        })
        agent.artifactIds.forEach(artifactId => {
          edgeUpdates.push({
            id: `agent-know-${agent.agentId}-${artifactId}`,
            hidden: lens !== "agent",
            color: { inherit: "both", opacity: SOLID_OPACITY }
          })
        })
      })
      edgesDataSet.update(edgeUpdates)

      network.setOptions({ physics: { enabled: true } })
      network.once("stabilizationIterationsDone", stopPhysics)
      network.once("stabilized", stopPhysics)
    }
    applyLensRef.current = applyLens

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
      } else if (nodeId.startsWith("agent-")) {
        const agentId = nodeId.replace("agent-", "")
        const agent = agentLayer.get(agentId)
        if (agent) {
          setAgentPreview({
            agentId: agent.agentId,
            name: agent.name,
            conversationIds: Array.from(agent.conversationIds),
            artifactIds: Array.from(agent.artifactIds)
          })
        }
      }
    })

    return () => {
      network.destroy()
      networkRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knowledge, chats, agentBundles])

  const LENS_LABEL: Record<Lens, string> = { default: "Padrão", chat: "Chat", agent: "Agente" }

  return (
    <div className="relative size-full">
      <div className="absolute left-4 top-4 z-[60] flex gap-1 rounded-lg border bg-background/80 p-1 backdrop-blur-sm">
        {(["default", "chat", "agent"] as Lens[]).map(lens => (
          <Button
            key={lens}
            size="sm"
            variant={activeLens === lens ? "default" : "ghost"}
            onClick={() => {
              setActiveLens(lens)
              applyLensRef.current(lens)
            }}
          >
            {LENS_LABEL[lens]}
          </Button>
        ))}
      </div>
      <div ref={containerRef} className="size-full" />
      {preview && (
        <KnowledgePreviewModal
          record={preview.record}
          chatName={preview.chatName}
          onClose={() => setPreview(null)}
          overlay="absolute"
        />
      )}
      {agentPreview && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setAgentPreview(null)}
        >
          <div
            className="bg-background max-w-sm rounded-xl border p-4 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-semibold">{agentPreview.name}</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              {agentPreview.conversationIds.length} conversa(s), {agentPreview.artifactIds.length} artefato(s)
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
