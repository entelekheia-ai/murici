/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

"use client"

import { FC, useState, useEffect, useRef, useContext } from "react"
import Image from "next/image"
import { Button } from "../ui/button"
import { ChatbotUIContext } from "@/context/context"
import type { UnpackPayload, AgentAboutme } from "@/types/electron"
import { IconCircleCheck, IconCircleDot, IconCircle, IconX, IconFolderOpen, IconGlobe, IconFileText, IconLayout, IconCircleX, IconClock, IconDatabase, IconActivity } from "@tabler/icons-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "../ui/accordion"
import { KernelProxy } from "@/lib/kernel-proxy"
import { KnowledgeChip } from "../knowledge/knowledge-chip"
import { KnowledgeRecord } from "@/types/knowledge"
import { StateGraph } from "../agents/state-graph"
import { useRouter, useParams } from "next/navigation"

export const RightSidebar: FC = () => {
  const router = useRouter()
  const params = useParams()
  const locale = (params?.locale as string) || "local"
  const workspaceid = (params?.workspaceid as string) || "local"
  const { 
    setFlowState, setFlowEngine, flowState, setAgentKnowledgeFiles, setAgentPersona,
    knowledge, setKnowledge, chatSettings, availableLocalModels, backgroundModel, selectedChat,
    setShowRightSidebar
  } = useContext(ChatbotUIContext)

  const [engine, setEngine] = useState<any>(null)
  const [currentState, setCurrentState] = useState<string>("")
  const [graphData, setGraphData] = useState<string | null>(null)
  const [visitedStates, setVisitedStates] = useState<Set<string>>(new Set())
  const [parseError, setParseError] = useState<string | null>(null)
  const [behaviorText, setBehaviorText] = useState("")
  const [agentMeta, setAgentMeta] = useState<AgentAboutme | null>(null)
  const [agentLoading, setAgentLoading] = useState(false)
  
  const [mcpServers, setMcpServers] = useState<{ serverName: string; tools: any[] }[]>([])
  const [toolsLoading, setToolsLoading] = useState(true)

  useEffect(() => {
    fetch("/api/mcp/tools")
      .then(res => res.json())
      .then(data => {
        setMcpServers(data || [])
        setToolsLoading(false)
      })
      .catch(err => {
        console.error("Error loading MCP tools", err)
        setToolsLoading(false)
      })
  }, [])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const engineRef = useRef<any>(null)
  const visitedRef = useRef<Set<string>>(new Set())
  const knowledgeRef = useRef<Array<{ path: string; content: string }>>([])
  const guidesRef = useRef<Array<{ path: string; content: string }>>([])
  const behaviorsRef = useRef<Array<{ path: string; content: string }>>([])
  
  const loadAgentBundleRef = useRef<(payload: UnpackPayload) => Promise<void>>(
    async () => { }
  )
  const handleAgentFileRef = useRef<(file: File) => Promise<void>>(async () => { })

  const resolveTeach = (name: string | undefined): string | undefined => {
    if (!name) return undefined
    const entry = knowledgeRef.current.find(
      k => k.path === name || k.path === `knowledge/${name}` || k.path.endsWith(`/${name}`)
    )
    return entry ? entry.content : name
  }

  const loadBehavior = async (
    eng: any,
    text: string,
    know: Array<{ path: string; content: string }> = knowledgeRef.current,
    guides: Array<{ path: string; content: string }> = guidesRef.current,
    behaviors: Array<{ path: string; content: string }> = behaviorsRef.current
  ) => {
    knowledgeRef.current = know
    guidesRef.current = guides
    behaviorsRef.current = behaviors
    setAgentKnowledgeFiles(know)
    visitedRef.current = new Set()
    setParseError(null)

    try {
      const effects = await eng.load_behavior(text, know, guides, behaviors)
      
      const parseErrorEffect = effects.find((e: any) => e.type === "parse_error")
      if (parseErrorEffect) {
        setParseError(parseErrorEffect.message)
        return
      }

      const state = eng.get_current_state()
      visitedRef.current.add(state)
      setCurrentState(state)
      setVisitedStates(new Set([state]))

      const graph = eng.get_graph()
      setGraphData(graph)

      const goal = effects.find((e: any) => e.type === "goal")?.text
      const guide = effects.find((e: any) => e.type === "guide")?.text
      const teach = resolveTeach(effects.find((e: any) => e.type === "teach")?.text)

      setFlowState({
        currentState: state,
        goal,
        guide,
        teach,
        validIntents: Array.from(eng.get_valid_intents() || []) as string[],
        graph
      })
    } catch (e: any) {
      setParseError(e.message || "Failed to load behavior")
    }
  }

  useEffect(() => {
    if (!flowState?.currentState || !engineRef.current) return
    const newState = flowState.currentState
    if (newState === currentState) return
    visitedRef.current.add(newState)
    setCurrentState(newState)
    setVisitedStates(new Set(visitedRef.current))
    const freshGraph = engineRef.current.get_graph()
    if (freshGraph) setGraphData(freshGraph)
  }, [flowState?.currentState])

  useEffect(() => {
    let mounted = true

    loadAgentBundleRef.current = async (payload: UnpackPayload) => {
      setAgentMeta(payload.aboutme)
      setAgentPersona(payload.aboutme.persona || null)
      if (mounted) setBehaviorText(payload.behaviorText)
      if (engineRef.current && mounted) {
        await loadBehavior(engineRef.current, payload.behaviorText, payload.knowledge, payload.guides, payload.behaviors)
      }
    }

    ;(async () => {
      try {
        const proxy = new KernelProxy()
        engineRef.current = proxy
        setEngine(proxy)
        setFlowEngine(proxy)

        if (mounted && behaviorText) {
          await loadBehavior(proxy, behaviorText)
        }

        if (typeof window !== "undefined" && window.electronAPI?.onOpenAgentFile) {
          window.electronAPI.onOpenAgentFile((payload: UnpackPayload) => {
            loadAgentBundleRef.current(payload)
          })
        }
      } catch (err) {
        console.error("Failed to initialize kernel proxy:", err)
      }
    })()

    const onAgentDrop = (e: Event) => {
      const file = (e as CustomEvent<{ file: File }>).detail.file
      handleAgentFileRef.current(file)
    }
    window.addEventListener("agent:drop", onAgentDrop)

    return () => {
      mounted = false
      window.removeEventListener("agent:drop", onAgentDrop)
      if (engineRef.current) {
        engineRef.current.destroy()
      }
    }
  }, [])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await handleAgentFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleLoadAgentClick = () => {
    fileInputRef.current?.click()
  }

  const handleAgentFile = async (file: File) => {
    if (!file.name.endsWith(".agent")) return
    setAgentLoading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/agent/unpack", {
        method: "POST",
        body: formData
      })
      if (!res.ok) {
        const error = await res.json()
        setParseError(error.error || "Failed to unpack agent")
        return
      }
      const payload: UnpackPayload = await res.json()
      await loadAgentBundleRef.current(payload)
    } catch (err: any) {
      setParseError(err.message || "Failed to load agent")
    } finally {
      setAgentLoading(false)
    }
  }
  handleAgentFileRef.current = handleAgentFile

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files?.[0]
    if (file) handleAgentFile(file)
  }

  const modelData = chatSettings?.model
    ? availableLocalModels.find(m => m.modelId === chatSettings.model)
    : undefined

  const handleUpdate = (id: string, updates: Partial<KnowledgeRecord>) => {
    setKnowledge(prev => prev.map(k => (k.id === id ? { ...k, ...updates } : k)))
  }

  const sortedKnowledge = [...knowledge].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  const validIntents = engine
    ? (Array.from(engine.get_valid_intents() || []) as string[])
    : []

  return (
    <div
      className="bg-inspector-bg flex h-full w-[320px] flex-col border-l border-sidebar-border"
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="drag-region flex items-center justify-between border-b p-4 border-sidebar-border/50 shrink-0">
        <h2 className="select-none text-[15px] font-semibold text-murici-text-primary">
          Detalhes
        </h2>
        <Button size="icon" variant="ghost" className="no-drag h-6 w-6 text-murici-text-primary hover:text-murici-text-primary" onClick={() => setShowRightSidebar(false)}>
          <IconX size={16} stroke={2} />
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6 text-murici-text-primary">
        <div className="flex flex-col space-y-6">
          <Accordion type="single" collapsible defaultValue="arquivos" className="w-full border-none">
            <AccordionItem value="arquivos" className="border-none">
              <AccordionTrigger className="text-xs uppercase font-semibold text-murici-text-secondary py-2 hover:no-underline tracking-wider">
                Arquivos do Chat
              </AccordionTrigger>
              <AccordionContent>
                {sortedKnowledge.length === 0 ? (
                  <p className="text-muted-foreground text-xs mt-2">
                    Nenhum artefato ainda nesta conversa.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3 mt-2">
                    {sortedKnowledge.map(record => (
                      <KnowledgeChip
                        key={record.id}
                        record={record}
                        modelData={backgroundModel ?? modelData}
                        chatName={selectedChat?.name ?? "Conversa"}
                        onUpdate={handleUpdate}
                      />
                    ))}
                    <div className="flex justify-end w-full">
                      <Button 
                        variant="ghost" 
                        className="text-[13px] font-medium text-[#C05621] hover:text-[#C05621]/80 hover:bg-transparent h-auto p-0 justify-end"
                        onClick={() => {
                          setShowRightSidebar(false)
                          router.push(`/${locale}/${workspaceid}/graph`)
                        }}
                      >
                        Ver todos os arquivos &rarr;
                      </Button>
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="h-px w-full bg-sidebar-border" />

          {!agentMeta && !flowState?.currentState ? (
            <div className="flex flex-col items-center justify-center p-6 gap-4 bg-[#F7E7D4]">
              <input
                ref={fileInputRef}
                type="file"
                accept=".agent"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Image 
                src="/empty-state-agent.png" 
                alt="Empty Agent State" 
                width={48} 
                height={48} 
              />
              <h2 className="text-[20px] font-bold font-instrument-sans text-murici-text-primary text-center leading-tight">
                Inicie um .agent
              </h2>
              <Button
                className="bg-murici-orange hover:bg-murici-orange/90 text-white rounded-[12px] h-11 px-4 font-instrument-sans font-bold text-[13px] gap-2.5 flex items-center shadow-none border-none mt-1"
                onClick={handleLoadAgentClick}
                disabled={agentLoading}
              >
                <IconFolderOpen size={16} stroke={2.5} />
                {agentLoading ? "Carregando..." : "Iniciar"}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col space-y-6">
              <div className="space-y-4">
                <h3 className="font-semibold text-murici-text-primary text-[15px]">{agentMeta?.name || "Agente"}</h3>
                {agentMeta?.description && (
                  <div className="space-y-2">
                    <h3 className="font-semibold uppercase text-[10px] text-murici-text-secondary tracking-wider">Descrição do Agente</h3>
                    <p className="text-[13px] text-murici-text-primary whitespace-pre-wrap leading-relaxed">
                      {agentMeta.description}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold uppercase text-[10px] text-murici-text-secondary tracking-wider">Histórico de Estados</h3>
                <div className="space-y-2">
                  {Array.from(visitedStates).map(state => (
                    <div key={`visited-${state}`} className="flex items-center space-x-2 text-sm text-murici-text-secondary">
                      <IconCircleCheck size={16} className="text-murici-green" />
                      <span>{state}</span>
                    </div>
                  ))}
                  
                  {currentState && (
                    <div className="flex items-center space-x-2 text-sm font-semibold">
                      <IconCircleDot size={16} className="text-murici-orange" />
                      <span>{currentState}</span>
                    </div>
                  )}

                  {!currentState && Array.from(visitedStates).length === 0 && (
                    <p className="text-muted-foreground text-xs">Aguardando início do fluxo...</p>
                  )}
                </div>
              </div>

              {graphData && (
                <div className="space-y-3">
                  <Accordion type="single" collapsible className="w-full border-none">
                    <AccordionItem value="graph" className="border-none">
                      <AccordionTrigger className="text-[10px] uppercase font-semibold text-murici-text-secondary py-2 hover:no-underline tracking-wider">
                        Grafo de Execução
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="bg-transparent overflow-auto rounded-lg border border-sidebar-border p-2 min-h-[200px]">
                          <StateGraph
                            scxml={graphData}
                            visitedStates={visitedStates}
                          />
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              )}
              
            </div>
          )}

          <div className="h-px w-full bg-sidebar-border" />

          <div className="space-y-4">
            <h3 className="font-semibold uppercase text-xs text-murici-text-secondary tracking-wider">Ferramentas</h3>
            {toolsLoading ? (
              <p className="text-muted-foreground text-xs">Carregando...</p>
            ) : (
              <div className="space-y-1">
                <Accordion type="multiple" className="w-full border-none">
                  <AccordionItem value="murici" className="border-none">
                    <AccordionTrigger className="text-[13px] font-semibold text-murici-text-primary py-2 hover:no-underline tracking-wider">
                      murici
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="flex flex-col space-y-2 ml-2">
                        <div className="text-[13px] text-murici-text-secondary">trigger_intent</div>
                        <div className="text-[13px] text-murici-text-secondary">state_graph</div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  {mcpServers.map(server => (
                    <AccordionItem key={server.serverName} value={server.serverName} className="border-none">
                      <AccordionTrigger className="text-[13px] font-semibold text-murici-text-primary py-2 hover:no-underline tracking-wider">
                        {server.serverName}
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="flex flex-col space-y-2 ml-2">
                          {server.tools.map((t: any) => (
                            <div key={t.name} className="text-[13px] text-murici-text-secondary">{t.name}</div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            )}
          </div>

          {parseError && (
            <div className="rounded border border-red-500 bg-red-500/10 p-3 text-sm text-red-500 mt-4">
              <div className="mb-1 font-bold">Erro de Parse</div>
              <pre className="whitespace-pre-wrap font-mono text-xs">
                {parseError}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
