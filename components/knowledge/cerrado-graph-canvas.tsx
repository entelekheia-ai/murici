// SPDX-License-Identifier: Apache-2.0

"use client"

import { FC, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Engine, LabelSpec } from "@entelekheia-ai/cerrado/engine"
import type { Region, Scene } from "@entelekheia-ai/cerrado"
import { buildGraphData } from "@/lib/knowledge/cerrado-adapter"
import {
  LENS_SOURCES,
  MAP_SOURCE,
  type LensKey
} from "@/lib/knowledge/graph/sources"
import { parseGraphRef } from "@/lib/knowledge/ref"
import type {
  AgentBundleRecord,
  RecentAgentRecord
} from "@/lib/local-db/schema"
import type { Tables } from "@/types/database"
import type { KnowledgeRecord } from "@/types/knowledge"
import { Button } from "@/components/ui/button"
import { useGraphClick } from "./use-graph-click"

/** The props both graph canvases take. */
export interface CerradoGraphCanvasProps {
  knowledge: KnowledgeRecord[]
  chats: Tables<"chats">[]
  agentBundles: AgentBundleRecord[]
  recentAgents?: RecentAgentRecord[]
  /**
   * Called once when the engine cannot be mounted (no WebGPU, or any failure
   * before it starts), with the reason. The caller shows another renderer.
   */
  onUnavailable?: (reason: string) => void
}

const NO_RECENT_AGENTS: RecentAgentRecord[] = []
const LENSES: LensKey[] = ["default", "chat", "agent"]

/** The key of the translation of a node kind, for the hover subtitle. */
function kindOf(id: string): string {
  switch (parseGraphRef(id)?.kind) {
    case "conversation":
      return "Chat"
    case "knowledge":
      return "Knowledge"
    case "agent":
      return "Agent"
    default:
      return ""
  }
}

/** The first opaque background colour from `el` up to the document, as a CSS string. */
function pageBackground(el: HTMLElement): string {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const c = getComputedStyle(n).backgroundColor
    if (c && c !== "transparent" && !/^rgba\([^)]*,\s*0\)$/.test(c)) return c
  }
  return "#ffffff"
}

/**
 * One name per region with a label and at least one node routed to it, anchored
 * on those nodes so the name follows its land through a lens morph.
 */
function territoryLabels(
  scene: Scene,
  regions: readonly Region[],
  style: Pick<LabelSpec, "size" | "background">,
  darken: boolean,
  parseColor: (
    c: string,
    fallback: [number, number, number, number]
  ) => number[],
  alwaysZoom: number
): LabelSpec[] {
  const nodesOf = new Map<string, number[]>()
  scene.meta.forEach((m, i) => {
    if (!m.region || scene.zoom.node(m.tier).min >= alwaysZoom) return
    const list = nodesOf.get(m.region)
    if (list) list.push(i)
    else nodesOf.set(m.region, [i])
  })
  const band = scene.zoom.label("region")
  return regions.flatMap(r => {
    const nodes = nodesOf.get(r.id)
    if (!r.label || !nodes) return []
    const c = parseColor(r.color ?? "#000", [0, 0, 0, 1])
    // A region's own colour vanishes on its own wash; darkening keeps the hue legible on a light page.
    const k = darken ? 0.45 : 1
    return [
      {
        text: r.label,
        nodes,
        minZoom: band.min,
        maxZoom: band.max,
        size: style.size,
        align: "center" as const,
        background: style.background,
        color: [c[0]! * k, c[1]! * k, c[2]! * k, 1] as [
          number,
          number,
          number,
          number
        ]
      }
    ]
  })
}

// The lens the reader last chose. A reload opens on it, which is what lets the
// layout saved for that lens be read back: a live lens switch re-solves, and only
// a reload restores (cerrado's solve-once, freeze, persist per map and view).
const LAST_LENS_KEY = "murici.graph.lens"

function readLastLens(store: Storage): LensKey {
  try {
    const v = store.getItem(LAST_LENS_KEY)
    return v === "chat" || v === "agent" ? v : "default"
  } catch {
    return "default"
  }
}

function writeLastLens(store: Storage, lens: LensKey): void {
  try {
    store.setItem(LAST_LENS_KEY, lens)
  } catch {
    // Storage full or unavailable: the next reload opens on the default lens.
  }
}

/**
 * Registers lucide as the engine's icon font, so a lens's `icon: "lucide:<name>"`
 * draws that glyph inside the node. The font and its codepoints load on demand,
 * with the engine. A failure draws the graph without icons rather than not at all.
 */
async function loadIcons(eng: Engine): Promise<boolean> {
  try {
    const [{ default: fontUrl }, { default: codepoints }] = await Promise.all([
      import("lucide-static/font/lucide.woff2"),
      import("lucide-static/font/codepoints.json")
    ])
    const face = new FontFace("lucide", `url(${fontUrl})`)
    document.fonts.add(face)
    try {
      await face.load()
    } catch (err) {
      document.fonts.delete(face)
      throw err
    }
    const table = codepoints as Record<string, number>
    await eng.loadIconFont({
      prefix: "lucide",
      fontFamily: "lucide",
      glyph: name => {
        const cp = table[name]
        return cp === undefined ? undefined : String.fromCodePoint(cp)
      }
    })
    return true
  } catch (err) {
    console.warn("icon font failed to load; drawing without icons", err)
    return false
  }
}

/**
 * The knowledge graph drawn by cerrado's WebGPU engine, mounted the way the
 * engine's own sample host mounts it: the map's zoom course, the saved layout
 * (frozen when it covers every node), territory names and node captions, lens
 * buttons that morph the layout in place. A click acts through `useGraphClick`.
 *
 * Any failure before the engine starts — including a browser without WebGPU —
 * calls `onUnavailable` instead of throwing, and so does losing the GPU device
 * afterwards. Unmounting calls `destroy()`, which releases the engine's
 * listeners, frame loop and GPU device.
 */
export const CerradoGraphCanvas: FC<CerradoGraphCanvasProps> = ({
  knowledge,
  chats,
  agentBundles,
  recentAgents = NO_RECENT_AGENTS,
  onUnavailable
}) => {
  const { t } = useTranslation()
  const { onNodeClick, overlay } = useGraphClick({
    knowledge,
    chats,
    agentBundles,
    recentAgents
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeLens, setActiveLens] = useState<LensKey>("default")
  const [hoverKind, setHoverKind] = useState("")
  const [ready, setReady] = useState(false)
  // Read through refs so a new callback identity never remounts the engine.
  const onNodeClickRef = useRef(onNodeClick)
  const onUnavailableRef = useRef(onUnavailable)
  useEffect(() => {
    onNodeClickRef.current = onNodeClick
    onUnavailableRef.current = onUnavailable
  })
  const switchLensRef = useRef<(lens: LensKey) => void>(() => {})

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    setReady(false)
    setHoverKind("")
    let cancelled = false
    let engine: Engine | null = null
    let started = false
    const canvas = document.createElement("canvas")
    canvas.className = "size-full"
    canvas.style.display = "block"
    container.appendChild(canvas)

    const mount = async (): Promise<void> => {
      // No server render may reach navigator.gpu: the engine loads here, in the browser, on demand.
      const cerrado = await import("@entelekheia-ai/cerrado")
      const { Engine: EngineClass } =
        await import("@entelekheia-ai/cerrado/engine")
      const { buildScene, parseColor, parseMap, parseView, ZOOM_ALWAYS } =
        cerrado
      const { layoutKey, loadLayout, saveLayout, restoreLayout } = cerrado

      const data = buildGraphData({
        knowledge,
        agentBundles,
        chats,
        recentAgents
      })
      const map = parseMap(MAP_SOURCE)
      const views = {
        default: parseView(LENS_SOURCES.default),
        chat: parseView(LENS_SOURCES.chat),
        agent: parseView(LENS_SOURCES.agent)
      }

      if (cancelled) return
      const eng = new EngineClass(canvas)
      engine = eng
      await eng.init()
      if (cancelled) return
      await eng.loadFont({
        fontFamily:
          '"Iowan Old Style", Palatino, "Palatino Linotype", Georgia, serif',
        fontWeight: 600,
        size: 48
      })
      if (cancelled) return
      const iconsLoaded = await loadIcons(eng)
      if (cancelled) return
      eng.fitMargin = map.zoom?.fit_margin ?? eng.fitMargin
      eng.maxMagnification = map.zoom?.max_magnification ?? eng.maxMagnification
      eng.camera.elastic = map.zoom?.elastic ?? eng.camera.elastic

      const store = window.localStorage
      let active: LensKey = readLastLens(store)
      const keyFor = (lens: LensKey): string => layoutKey(map, views[lens])
      let scene = buildScene(data, map, views[active])
      const idsOf = (s: Scene): string[] => s.meta.map(m => m.id)

      const saved = loadLayout(store, keyFor(active))
      const restored = saved
        ? restoreLayout(scene.nodes, idsOf(scene), saved)
        : null
      if (!restored?.complete) {
        // Nothing usable saved: scatter the seed so the first solve is visibly at work.
        for (const n of scene.nodes) {
          n.x += (Math.random() - 0.5) * 700
          n.y += (Math.random() - 0.5) * 700
        }
      }

      // The lenses declare no canvas_background: the page decides the paper colour.
      const paper = parseColor(pageBackground(container), [1, 1, 1, 1])
      eng.setBackground(paper)
      const lightPage =
        0.299 * paper[0]! + 0.587 * paper[1]! + 0.114 * paper[2]! > 0.5
      const ink: [number, number, number, number] = lightPage
        ? [0.16, 0.18, 0.22, 1]
        : [0.9, 0.92, 0.95, 1]

      const applyCrossfade = (): void => {
        if (scene.zoom.crossfade !== undefined)
          eng.zoomCrossfade = scene.zoom.crossfade
      }
      applyCrossfade()
      eng.setCanopyConfig(scene.paint)
      eng.setGraph(scene.nodes, scene.edges)
      eng.simulate = true
      eng.canopy = true
      eng.requestFit()
      // A fully restored layout is the answer: physics over it would drift from the geography the reader knows.
      if (restored?.complete) eng.freeze()

      const labelTheme = (): {
        region: number
        node: number
        background: NonNullable<LabelSpec["background"]>
      } => {
        const lt = views[active].theme?.label
        const bg = lt?.background
        return {
          region: lt?.region_size ?? 34,
          node: lt?.node_size ?? 18,
          background: {
            color: [
              ...(bg?.color ? parseColor(bg.color, paper) : paper).slice(0, 3),
              bg?.opacity ?? 0.5
            ] as [number, number, number, number],
            padding: bg?.padding ?? 0.15,
            blur: bg?.blur ?? 1.2,
            shape: bg?.shape ?? "oval"
          }
        }
      }
      const allLabels = (): LabelSpec[] => {
        const th = labelTheme()
        const names = territoryLabels(
          scene,
          map.regions,
          { size: th.region, background: th.background },
          lightPage,
          parseColor,
          ZOOM_ALWAYS
        )
        const captions = scene.meta.flatMap((m, i): LabelSpec[] => {
          const band = scene.zoom.label(`${m.tier}.node`)
          if (band.min >= ZOOM_ALWAYS) return []
          return [
            {
              // A conversation with no chat row has no name: say what it is, as the vis canvas does.
              text:
                m.label ??
                (parseGraphRef(m.id)?.kind === "conversation"
                  ? t("Conversation")
                  : m.id),
              node: i,
              size: th.node,
              align: "center",
              background: th.background,
              // A node that draws an icon needs no offset: the engine drops its caption below the disc.
              dy: scene.nodes[i]!.icon && iconsLoaded ? 0 : 20,
              color: ink,
              minZoom: band.min,
              maxZoom: band.max
            }
          ]
        })
        return [...names, ...captions]
      }
      eng.setLabels(allLabels())

      eng.onSettle = () => {
        // Captured now: the reader may switch lens before the readback resolves.
        const lens = active
        const ids = idsOf(scene)
        void eng.readPositions().then(xy => {
          if (xy && !cancelled) saveLayout(store, keyFor(lens), ids, xy)
        })
      }
      eng.onHover = i =>
        setHoverKind(i === null ? "" : kindOf(scene.meta[i]!.id))
      eng.onClick = i => {
        if (i !== null) onNodeClickRef.current(scene.meta[i]!.id)
      }

      switchLensRef.current = lens => {
        active = lens
        writeLastLens(store, lens)
        scene = buildScene(data, map, views[lens])
        applyCrossfade()
        eng.morphTo(scene.nodes, scene.paint)
        eng.setEdges(scene.edges)
        eng.glideToFit()
        eng.setLabels(allLabels())
      }

      // A lost GPU device leaves the engine inert: release it and draw with the fallback instead.
      eng.onDeviceLost(info => {
        if (cancelled) return
        eng.destroy()
        onUnavailableRef.current?.(
          `GPU device lost (${info.reason}): ${info.message}`
        )
      })

      if (cancelled) return
      eng.start()
      started = true
      setActiveLens(active)
      setReady(true)
    }

    mount().catch(err => {
      if (cancelled || started) return
      onUnavailableRef.current?.(
        err instanceof Error ? err.message : String(err)
      )
    })

    return () => {
      cancelled = true
      switchLensRef.current = () => {}
      // Releases the listeners, the frame loop and the GPU device, started or not; idempotent.
      engine?.destroy()
      canvas.remove()
    }
  }, [knowledge, chats, agentBundles, recentAgents])

  const LENS_LABEL: Record<LensKey, string> = {
    default: t("Default"),
    chat: t("Chat"),
    agent: t("Agent")
  }

  return (
    <div className="relative size-full">
      <div className="absolute left-4 top-4 z-60 flex gap-1 rounded-lg border bg-background/80 p-1 backdrop-blur-xs">
        {LENSES.map(lens => (
          <Button
            key={lens}
            size="sm"
            variant={activeLens === lens ? "default" : "ghost"}
            disabled={!ready}
            onClick={() => {
              setActiveLens(lens)
              switchLensRef.current(lens)
            }}
          >
            {LENS_LABEL[lens]}
          </Button>
        ))}
      </div>
      <div ref={containerRef} className="size-full" />
      {hoverKind && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 text-center text-xs text-muted-foreground">
          {t(hoverKind)}
        </div>
      )}
      {overlay}
    </div>
  )
}
