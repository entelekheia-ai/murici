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

import { FC, useState, useEffect, useRef, useContext } from "react"
import { Button } from "../ui/button"
import { StateGraph } from "./state-graph"
import { ChatbotUIContext } from "@/context/context"
import { Effect } from "@/types/kernel-effect"
import type { UnpackPayload, AgentAboutme } from "@/types/electron"
import { KernelProxy } from "@/lib/kernel-proxy"

export const AgentRightPanel: FC = () => {
  const { setFlowState, setFlowEngine } = useContext(ChatbotUIContext)

  const [activeTab, setActiveTab] = useState<"flow" | "agent">("flow")
  const [engine, setEngine] = useState<any>(null)
  const [currentState, setCurrentState] = useState<string>("")
  const [graphData, setGraphData] = useState<any>(null)
  const [visitedStates, setVisitedStates] = useState<Set<string>>(new Set())
  const [parseError, setParseError] = useState<string | null>(null)
  const [behaviorText, setBehaviorText] = useState(
    `state welcome
  goal "Help the user get started"
  guide "Be friendly and concise"
  interact
  on intent "continue" transition to setup
  on offtopic transition to welcome

state setup
  goal "Collect user preferences"
  interact
  on intent "done" transition to end
  on offtopic transition to setup

state end
  goal "Session complete"
  interact
  on intent "restart" transition to welcome`
  )
  const [agentMeta, setAgentMeta] = useState<AgentAboutme | null>(null)
  const [agentFileName, setAgentFileName] = useState<string | null>(null)
  const [agentLoading, setAgentLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const engineRef = useRef<any>(null)
  const visitedRef = useRef<Set<string>>(new Set())
  const loadAgentBundleRef = useRef<(payload: UnpackPayload) => Promise<void>>(
    async () => {}
  )

  const loadBehavior = async (eng: any, text: string) => {
    visitedRef.current = new Set()
    setParseError(null)

    try {
      const effects = await eng.load_behavior(text)
      console.log("load_behavior effects:", effects)

      const parseErrorEffect = effects.find(
        (e: any) => e.type === "parse_error"
      )
      if (parseErrorEffect) {
        setParseError(parseErrorEffect.message)
        return
      }

      const state = eng.get_current_state()
      visitedRef.current.add(state)
      setCurrentState(state)
      setVisitedStates(new Set([state]))

      const graph = eng.get_graph()
      console.log("get_graph() returned:", graph)
      setGraphData(graph)

      const hasOfftopic =
        graph?.transitions?.some(
          (t: any) => t.from === state && t.label === "offtopic"
        ) ?? false

      const goal = effects.find((e: any) => e.type === "goal")?.text
      const guide = effects.find((e: any) => e.type === "guide")?.text

      setFlowState({
        currentState: state,
        goal,
        guide,
        teach: undefined,
        validIntents: Array.from(eng.get_valid_intents() || []) as string[],
        hasOfftopic
      })
    } catch (e: any) {
      console.error("Error loading flow:", e)
      setParseError(e.message || "Failed to load behavior")
    }
  }

  useEffect(() => {
    let mounted = true

    loadAgentBundleRef.current = async (payload: UnpackPayload) => {
      setAgentMeta(payload.aboutme)
      setAgentFileName(null)
      if (engineRef.current && mounted) {
        await loadBehavior(engineRef.current, payload.behaviorText)
      }
      if (mounted) setActiveTab("flow")
    }

    ;(async () => {
      try {
        const proxy = new KernelProxy()
        engineRef.current = proxy
        setEngine(proxy)
        setFlowEngine(proxy)

        if (mounted) {
          await loadBehavior(proxy, behaviorText)
        }

        if (
          typeof window !== "undefined" &&
          window.electronAPI?.onOpenAgentFile
        ) {
          window.electronAPI.onOpenAgentFile((payload: UnpackPayload) => {
            loadAgentBundleRef.current(payload)
          })
        }
      } catch (err) {
        console.error("Failed to initialize kernel proxy:", err)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  const handleReload = async () => {
    if (engine) await loadBehavior(engine, behaviorText)
  }

  const handleSimulateIntent = async (intent: string) => {
    if (!engine) return
    try {
      const effects = await engine.send_intent(intent)
      const state = engine.get_current_state()
      const graph = engine.get_graph()
      const hasOfftopic =
        graph?.transitions?.some(
          (t: any) => t.from === state && t.label === "offtopic"
        ) ?? false

      visitedRef.current.add(state)
      setCurrentState(state)
      setVisitedStates(new Set(visitedRef.current))
      setGraphData(graph)

      const goal = effects.find((e: any) => e.type === "goal")?.text
      const guide = effects.find((e: any) => e.type === "guide")?.text

      setFlowState({
        currentState: state,
        goal,
        guide,
        teach: undefined,
        validIntents: Array.from(engine.get_valid_intents() || []) as string[],
        hasOfftopic
      })
    } catch (err) {
      console.error("Error sending intent:", err)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

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
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleLoadAgentClick = () => {
    console.log("handleLoadAgentClick called, fileInputRef:", fileInputRef.current)
    fileInputRef.current?.click()
  }

  const validIntents = engine
    ? (Array.from(engine.get_valid_intents() || []) as string[])
    : []

  return (
    <div className="bg-background flex h-full w-[400px] flex-col border-l-2">
      <div className="flex items-center justify-between border-b-2 p-4">
        <h2 className="text-lg font-bold">.agent / .flow Viewer</h2>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="mb-4 flex space-x-2 border-b">
          <Button
            variant={activeTab === "flow" ? "default" : "ghost"}
            onClick={() => setActiveTab("flow")}
          >
            .flow
          </Button>
          <Button
            variant={activeTab === "agent" ? "default" : "ghost"}
            onClick={() => setActiveTab("agent")}
          >
            .agent
          </Button>
        </div>

        {activeTab === "flow" && (
          <div className="flex flex-col space-y-4">
            <textarea
              className="bg-muted h-48 w-full rounded border p-2 font-mono text-sm"
              value={behaviorText}
              onChange={e => setBehaviorText(e.target.value)}
              placeholder="Type your .behavior here..."
            />

            <Button size="sm" variant="outline" onClick={handleReload}>
              Load / Reload Flow
            </Button>

            {parseError && (
              <div className="rounded border border-red-500 bg-red-500/10 p-3 text-sm text-red-500">
                <div className="mb-1 font-bold">Parse error</div>
                <pre className="whitespace-pre-wrap font-mono text-xs">
                  {parseError}
                </pre>
              </div>
            )}

            {graphData && (
              <div className="bg-muted/50 flex flex-1 flex-col overflow-hidden rounded border p-2">
                <h3 className="mb-2 font-semibold">State Graph</h3>
                <div className="border-primary/50 bg-background flex-1 overflow-auto rounded border border-dashed p-2">
                  <StateGraph
                    graph={graphData}
                    activeState={currentState}
                    visitedStates={visitedStates}
                  />
                </div>
              </div>
            )}

            <div className="rounded border border-blue-500 bg-blue-500/10 p-2 text-sm text-blue-500">
              <div className="mb-2">
                <span className="font-bold">Current State:</span>{" "}
                {currentState || "—"}
              </div>

              {(validIntents.length > 0 ||
                graphData?.transitions?.some(
                  (t: any) => t.from === currentState && t.label === "offtopic"
                )) && (
                <div className="flex flex-wrap gap-1">
                  <span className="mr-1 font-bold">Simulate:</span>
                  {validIntents.map(intent => (
                    <Button
                      key={intent}
                      size="sm"
                      variant="outline"
                      className="h-6 text-xs"
                      onClick={() => handleSimulateIntent(intent)}
                    >
                      {intent}
                    </Button>
                  ))}
                  {graphData?.transitions?.some(
                    (t: any) =>
                      t.from === currentState && t.label === "offtopic"
                  ) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 border-yellow-500 text-xs text-yellow-500"
                      onClick={() => engine.send_offtopic()}
                    >
                      offtopic
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "agent" && (
          <div className="flex flex-col space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".agent"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleLoadAgentClick}
              disabled={agentLoading}
            >
              {agentLoading ? "Loading..." : "Carregar .agent"}
            </Button>

            {agentMeta ? (
              <div className="rounded border border-green-500 bg-green-500/10 p-4 space-y-3">
                <div className="space-y-2">
                  <div>
                    <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                      Nome:
                    </span>{" "}
                    <span className="text-sm">{agentMeta.name}</span>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                      Versão:
                    </span>{" "}
                    <span className="text-sm">{agentMeta.version}</span>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                      Domínio:
                    </span>{" "}
                    <span className="text-sm">{agentMeta.domain}</span>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                      Persona:
                    </span>{" "}
                    <span className="text-sm">{agentMeta.persona}</span>
                  </div>
                  <div className="pt-2">
                    <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                      Descrição:
                    </span>
                    <p className="text-sm mt-1 text-green-900 dark:text-green-200">
                      {agentMeta.description}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-muted text-muted-foreground flex h-48 items-center justify-center rounded border p-2">
                Clique em "Carregar .agent" para importar
              </div>
            )}

            {parseError && (
              <div className="rounded border border-red-500 bg-red-500/10 p-3 text-sm text-red-500">
                <div className="mb-1 font-bold">Erro</div>
                <pre className="whitespace-pre-wrap font-mono text-xs">
                  {parseError}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
