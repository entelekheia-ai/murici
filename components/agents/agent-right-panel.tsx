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

  // Refs to avoid stale closures inside the WASM observer callback
  const goalRef = useRef<string | undefined>(undefined)
  const guideRef = useRef<string | undefined>(undefined)
  const teachRef = useRef<string | undefined>(undefined)
  const currentStateRef = useRef<string>("")
  const engineRef = useRef<any>(null)
  const visitedRef = useRef<Set<string>>(new Set())

  const updateFlowState = (eng: any) => {
    const state = eng.get_current_state()
    const hasOfftopic =
      graphData?.transitions?.some(
        (t: any) => t.from === state && t.label === "offtopic"
      ) ?? false
    setFlowState({
      currentState: state,
      goal: goalRef.current,
      guide: guideRef.current,
      teach: teachRef.current,
      validIntents: Array.from(eng.get_valid_intents() || []) as string[],
      hasOfftopic
    })
  }

  const loadBehavior = (eng: any, text: string) => {
    goalRef.current = undefined
    guideRef.current = undefined
    teachRef.current = undefined
    visitedRef.current = new Set()
    setParseError(null)

    try {
      const effects = eng.load_behavior(text)
      console.log("load_behavior effects:", effects)
      const parseErrorEffect = effects.find(
        (e: any) => e.type === "parse_error"
      )
      if (parseErrorEffect) {
        setParseError(parseErrorEffect.message)
        return
      }
      const state = eng.get_current_state()
      currentStateRef.current = state
      visitedRef.current.add(state)
      setCurrentState(state)
      setVisitedStates(new Set([state]))
      const graph = eng.get_graph()
      console.log("get_graph() returned:", graph)
      setGraphData(graph)
      // Pass graph to updateFlowState so it can compute hasOfftopic
      const hasOfftopic =
        graph?.transitions?.some(
          (t: any) => t.from === state && t.label === "offtopic"
        ) ?? false
      setFlowState({
        currentState: state,
        goal: goalRef.current,
        guide: guideRef.current,
        teach: teachRef.current,
        validIntents: Array.from(eng.get_valid_intents() || []) as string[],
        hasOfftopic
      })
    } catch (e) {
      console.error("Error loading flow:", e)
    }
  }

  useEffect(() => {
    let mounted = true

    import("@dot-agent/kernel-dsl")
      .then(async module => {
        if (!mounted) return

        // Initialize wasm module
        await module.init()

        const behaviorEngine = new module.AgentDSLKernel()

        // Register observer — single subscriber, fires once per effect
        behaviorEngine.observe((effect: Effect) => {
          switch (effect.type) {
            case "goal":
              goalRef.current = effect.text
              break
            case "guide":
              guideRef.current = effect.text
              break
            case "teach":
              teachRef.current = effect.text
              break
            case "transition":
              goalRef.current = undefined
              guideRef.current = undefined
              teachRef.current = undefined
              visitedRef.current.add(effect.from)
              visitedRef.current.add(effect.to)
              currentStateRef.current = effect.to
              setCurrentState(effect.to)
              break
            case "request_interact":
              // All entry directives have fired — FSM is fully settled in the new state
              if (engineRef.current) {
                updateFlowState(engineRef.current)
                setGraphData(engineRef.current.get_graph())
                setVisitedStates(new Set(visitedRef.current))
              }
              break
            case "parse_error":
              console.error("Behavior parse error:", effect.message)
              break
            case "run_script":
              console.log("Behavior: run_script", {
                target: effect.target,
                label: effect.label,
                silent: effect.silent
              })
              break
            case "run_subagent":
              console.log("Behavior: run_subagent", {
                target: effect.target,
                label: effect.label,
                background: effect.background
              })
              break
            case "run_tool":
              console.log("Behavior: run_tool", {
                target: effect.target,
                label: effect.label
              })
              break
            case "set_memory":
              console.log("Behavior: set_memory", {
                domain: effect.domain,
                key: effect.key,
                value: effect.value
              })
              break
            case "apply_css":
              console.log("Behavior: apply_css", effect.value)
              break
            case "remove_css":
              console.log("Behavior: remove_css", effect.value)
              break
            case "apply_html":
              console.log("Behavior: apply_html", effect.value)
              break
            case "remove_html":
              console.log("Behavior: remove_html", effect.value)
              break
            case "apply_video":
              console.log("Behavior: apply_video", effect.value)
              break
            case "remove_video":
              console.log("Behavior: remove_video", effect.value)
              break
          }
        })

        engineRef.current = behaviorEngine
        setEngine(behaviorEngine)
        setFlowEngine(behaviorEngine)
        loadBehavior(behaviorEngine, behaviorText)
      })
      .catch(console.error)

    return () => {
      mounted = false
    }
  }, [])

  const handleReload = () => {
    if (engine) loadBehavior(engine, behaviorText)
  }

  const handleSimulateIntent = (intent: string) => {
    if (!engine) return
    engine.send_intent(intent)
    // Observer fires transition + entry effects → state updates reactively
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
          <div className="bg-muted text-muted-foreground flex h-48 items-center justify-center rounded border p-2">
            .agent specs will appear here
          </div>
        )}
      </div>
    </div>
  )
}
