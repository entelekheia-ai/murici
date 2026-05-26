"use client"

import { FlowEvent } from "@/types"
import { FC } from "react"

interface FlowEventCardProps {
  event: FlowEvent
}

export const FlowEventCard: FC<FlowEventCardProps> = ({ event }) => {
  const { type, data } = event

  return (
    <div className="border-border bg-muted/20 text-muted-foreground mx-4 my-1 rounded-lg border font-mono text-xs">
      {type === "flow_context" && <FlowContextCard data={data} />}
      {type === "llm_request" && <LlmRequestCard data={data} />}
      {type === "tool_call" && <ToolCallCard data={data} />}
      {type === "fsm_transition" && <FsmTransitionCard data={data} />}
      {type === "second_turn" && <SecondTurnCard />}
    </div>
  )
}

/* ── flow_context ─────────────────────────────────────── */
const FlowContextCard: FC<{ data: Record<string, any> }> = ({ data }) => (
  <div>
    <div className="border-border flex items-center gap-2 border-b px-3 py-2">
      <span>🔷</span>
      <span className="font-semibold text-violet-400">Flow</span>
      <span className="text-muted-foreground/70">
        state: <strong>{data.state}</strong>
      </span>
    </div>
    <div className="space-y-1 px-3 py-1.5">
      {data.goal && (
        <div>
          <span className="text-yellow-400">goal:</span>{" "}
          <span className="opacity-80">{data.goal}</span>
        </div>
      )}
      {data.guide && (
        <div>
          <span className="text-green-400">guide:</span>{" "}
          <span className="opacity-80">{data.guide}</span>
        </div>
      )}
      {data.teach && (
        <div>
          <span className="text-purple-400">teach:</span>{" "}
          <span className="opacity-80">{data.teach}</span>
        </div>
      )}
      {data.validIntents?.length > 0 && (
        <div>
          <span className="text-blue-400">intents:</span>{" "}
          <span className="opacity-80">{data.validIntents.join(" · ")}</span>
        </div>
      )}
    </div>
  </div>
)

/* ── llm_request ──────────────────────────────────────── */
const LlmRequestCard: FC<{ data: Record<string, any> }> = ({ data }) => (
  <div className="flex items-center gap-2 px-3 py-2">
    <span>⚙</span>
    <span className="font-semibold text-slate-400">chatbot-ui → LLM</span>
    <span className="text-muted-foreground/70">
      {data.messageCount} msgs
      {data.hasTools && (
        <span className="ml-1 text-orange-400">· tools: trigger_intent</span>
      )}
    </span>
  </div>
)

/* ── tool_call ────────────────────────────────────────── */
const ToolCallCard: FC<{ data: Record<string, any> }> = ({ data }) => (
  <div>
    <div className="flex items-center gap-2 px-3 py-2">
      <span>🔧</span>
      <span className="font-semibold text-orange-400">LLM</span>
      <span className="text-muted-foreground/70">
        trigger_intent(
        <strong className="text-orange-300">
          &quot;{data.intentName}&quot;
        </strong>
        )
      </span>
    </div>
  </div>
)

/* ── fsm_transition ───────────────────────────────────── */
const FsmTransitionCard: FC<{ data: Record<string, any> }> = ({ data }) => (
  <div>
    <div className="border-border flex items-center gap-2 border-b px-3 py-2">
      <span>→</span>
      <span className="font-semibold text-green-400">Flow</span>
      <span className="text-muted-foreground/70">
        <strong>{data.from}</strong>
        <span className="mx-1 text-green-400">→</span>
        <strong>{data.to}</strong>
      </span>
    </div>
    <div className="space-y-1 px-3 py-1.5">
      {data.newGoal && (
        <div>
          <span className="text-yellow-400">goal:</span>{" "}
          <span className="opacity-80">{data.newGoal}</span>
        </div>
      )}
      {data.newGuide && (
        <div>
          <span className="text-green-400">guide:</span>{" "}
          <span className="opacity-80">{data.newGuide}</span>
        </div>
      )}
      {data.effects?.length > 0 && (
        <details>
          <summary className="cursor-pointer select-none opacity-50 hover:opacity-70">
            {data.effects.length} efeito(s)
          </summary>
          <pre className="bg-muted mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded p-2">
            {JSON.stringify(data.effects, null, 2)}
          </pre>
        </details>
      )}
    </div>
  </div>
)

/* ── second_turn ──────────────────────────────────────── */
const SecondTurnCard: FC = () => (
  <div className="flex items-center gap-2 px-3 py-2">
    <span>⚙</span>
    <span className="font-semibold text-slate-400">chatbot-ui → LLM</span>
    <span className="text-muted-foreground/70">segundo turno</span>
  </div>
)
