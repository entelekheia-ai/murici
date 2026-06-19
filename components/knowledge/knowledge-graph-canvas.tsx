/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

"use client"

import { FC, useCallback, useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  NodeMouseHandler
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import dagre from "@dagrejs/dagre"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { KnowledgeRecord } from "@/types/knowledge"
import { Tables } from "@/types/database"

const NODE_W = 180
const NODE_H = 60

function applyDagre(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 80 })

  nodes.forEach(n => g.setNode(n.id, { width: NODE_W, height: NODE_H }))
  edges.forEach(e => g.setEdge(e.source, e.target))

  dagre.layout(g)

  return nodes.map(n => {
    const { x, y } = g.node(n.id)
    return { ...n, position: { x: x - NODE_W / 2, y: y - NODE_H / 2 } }
  })
}

function languageBg(lang: string): string {
  const palette = ["#3b82f6", "#22c55e", "#a855f7", "#f97316", "#ec4899", "#14b8a6", "#eab308"]
  let hash = 0
  for (let i = 0; i < lang.length; i++) hash = (hash * 31 + lang.charCodeAt(i)) & 0xffff
  return palette[hash % palette.length]
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

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [preview, setPreview] = useState<NodePreview | null>(null)

  const chatMap = new Map(chats.map(c => [c.id, c]))

  // Build conversation nodes only for chats that have at least one knowledge node
  useEffect(() => {
    const involvedChatIds = new Set(knowledge.map(k => k.originConversationId))

    const convNodes: Node[] = Array.from(involvedChatIds)
      .map(chatId => {
        const chat = chatMap.get(chatId)
        return {
          id: `conv-${chatId}`,
          type: "default",
          data: {
            label: chat?.name || "Conversa",
            nodeKind: "conversation",
            chatId
          },
          position: { x: 0, y: 0 },
          style: {
            background: "hsl(var(--muted))",
            border: "1.5px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
            padding: "8px 12px",
            width: NODE_W,
            cursor: "pointer"
          }
        }
      })

    const knowledgeNodes: Node[] = knowledge.map(k => {
      const lang = k.payload.language || "text"
      const color = languageBg(lang)
      return {
        id: `know-${k.id}`,
        type: "default",
        data: {
          label: k.title,
          nodeKind: "knowledge",
          recordId: k.id
        },
        position: { x: 0, y: 0 },
        style: {
          background: `${color}22`,
          border: `1.5px solid ${color}`,
          borderRadius: "20px",
          fontSize: "11px",
          padding: "6px 10px",
          width: NODE_W,
          cursor: "pointer"
        }
      }
    })

    const builtEdges: Edge[] = knowledge.map(k => ({
      id: `edge-${k.id}`,
      source: `know-${k.id}`,
      target: `conv-${k.originConversationId}`,
      type: "default",
      style: { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1.5, opacity: 0.6 }
    }))

    const allNodes = [...convNodes, ...knowledgeNodes]
    const positioned = applyDagre(allNodes, builtEdges)

    setNodes(positioned)
    setEdges(builtEdges)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knowledge])

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const kind = node.data?.nodeKind as string
      if (kind === "conversation") {
        const chatId = node.data?.chatId as string
        router.push(`/${locale}/${workspaceid}/chat/${chatId}`)
      } else if (kind === "knowledge") {
        const recordId = node.data?.recordId as string
        const record = knowledge.find(k => k.id === recordId)
        if (record) {
          const chat = chatMap.get(record.originConversationId)
          setPreview({ record, chatName: chat?.name || "Conversa" })
        }
      }
    },
    [knowledge, locale, workspaceid, router]
  )

  return (
    <div className="relative size-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Background />
        <Controls />
      </ReactFlow>

      {preview && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/40"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-background flex max-h-[80vh] w-[80vw] max-w-[1200px] flex-col overflow-hidden rounded-xl border shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-4">
              <div>
                <h2 className="text-base font-semibold leading-snug">{preview.record.title}</h2>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {preview.record.payload.language || "text"} · {preview.chatName}
                </p>
              </div>
              <button
                className="text-muted-foreground hover:text-foreground shrink-0 text-lg leading-none"
                onClick={() => setPreview(null)}
              >
                ✕
              </button>
            </div>
            {preview.record.summary && (
              <p className="text-muted-foreground shrink-0 border-b px-6 py-2 text-sm italic">
                {preview.record.summary}
              </p>
            )}
            <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
              {["md", "markdown"].includes((preview.record.payload.language ?? "").toLowerCase()) ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {preview.record.payload.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <pre className="bg-muted overflow-auto rounded-lg p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                  {preview.record.payload.content}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
