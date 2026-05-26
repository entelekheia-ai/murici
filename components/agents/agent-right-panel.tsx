import { FC, useState, useEffect, useRef, useContext } from "react"
import { Button } from "../ui/button"
import { StateGraph } from "./state-graph"
import { ChatbotUIContext } from "@/context/context"

export const AgentRightPanel: FC = () => {
  const { setFlowState, setFlowEngine } = useContext(ChatbotUIContext)

  const [activeTab, setActiveTab] = useState<"flow" | "agent">("flow")
  const [engine, setEngine] = useState<any>(null)
  const [currentState, setCurrentState] = useState<string>("")
  const [graphData, setGraphData] = useState<any>(null)
  const [visitedStates, setVisitedStates] = useState<Set<string>>(new Set())
  const [flowText, setFlowText] = useState(
    `state welcome\n  goal "Help the user get started"\n  guide "Be friendly and concise"\n  interact\n  on intent "continue" next setup\n\nstate setup\n  goal "Collect user preferences"\n  interact\n  on intent "done" next end\n\nstate end\n  goal "Session complete"`
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
    setFlowState({
      currentState: state,
      goal: goalRef.current,
      guide: guideRef.current,
      teach: teachRef.current,
      validIntents: Array.from(eng.get_valid_intents() || []) as string[]
    })
  }

  const loadFlow = (eng: any, text: string) => {
    goalRef.current = undefined
    guideRef.current = undefined
    teachRef.current = undefined
    visitedRef.current = new Set()

    try {
      eng.load_flow(text)
      const state = eng.get_current_state()
      currentStateRef.current = state
      visitedRef.current.add(state)
      setCurrentState(state)
      setVisitedStates(new Set([state]))
      setGraphData(eng.get_graph())
      updateFlowState(eng)
    } catch (e) {
      console.error("Error loading flow:", e)
    }
  }

  useEffect(() => {
    let mounted = true

    import("dot-agent-kernel")
      .then(module => {
        module.default().then(() => {
          if (!mounted) return

          const flowEngine = new module.FlowEngine()

          // Register observer — single subscriber, fires once per effect
          flowEngine.observe((effect: any) => {
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
                console.error("Flow parse error:", effect.message)
                break
            }
          })

          engineRef.current = flowEngine
          setEngine(flowEngine)
          setFlowEngine(flowEngine)
          loadFlow(flowEngine, flowText)
        })
      })
      .catch(console.error)

    return () => {
      mounted = false
    }
  }, [])

  const handleReload = () => {
    if (engine) loadFlow(engine, flowText)
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
              value={flowText}
              onChange={e => setFlowText(e.target.value)}
              placeholder="Type your .flow here..."
            />

            <Button size="sm" variant="outline" onClick={handleReload}>
              Load / Reload Flow
            </Button>

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

              {validIntents.length > 0 && (
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
