"use client"
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

import { FlowEvent } from "@/types"
import { FC } from "react"

interface FlowEventCardProps {
  event: FlowEvent
}

export const FlowEventCard: FC<FlowEventCardProps> = ({ event }) => {
  const { type, data } = event

  return (
    <div className="mx-4 my-1 rounded-lg border border-border bg-muted/20 font-mono text-xs text-muted-foreground">
      {type === "flow_context" && <FlowContextCard data={data} />}
      {type === "llm_request" && <LlmRequestCard data={data} />}
      {type === "tool_call" && <ToolCallCard data={data} />}
      {type === "fsm_transition" && <FsmTransitionCard data={data} />}
      {type === "second_turn" && <SecondTurnCard />}
      {type === "client_request" && (
        <WireCard
          icon="⬆"
          label="cliente → rota"
          tint="text-slate-400"
          summary={`${data.messageCount} msgs · POST ${data.api}`}
          json={data.body}
        />
      )}
      {type === "server_prompt" && (
        <WireCard
          icon="⚙"
          label="rota → modelo"
          tint="text-blue-400"
          summary={`${data.messages?.length ?? 0} msgs${
            data.system ? " · +system" : ""
          }`}
          json={{ system: data.system, messages: data.messages }}
        />
      )}
      {type === "tool_result" && (
        <WireCard
          icon="↩"
          label="tool → modelo"
          tint="text-green-400"
          summary={data.toolName}
          json={data.output}
        />
      )}
      {type === "llm_response" && (
        <WireCard
          icon="⬇"
          label="modelo → cliente"
          tint="text-teal-400"
          summary={
            data.text
              ? `"${String(data.text).slice(0, 60)}"`
              : `${data.parts?.length ?? 0} parts`
          }
          json={data.parts ?? data.text}
        />
      )}
      {type === "error" && (
        <WireCard
          icon="⛔"
          label="Erro"
          tint="text-red-400"
          summary={data.message}
          json={data}
        />
      )}
    </div>
  )
}

/* ── generic wire card (raw JSON, collapsed by default) ─── */
const WireCard: FC<{
  icon: string
  label: string
  tint: string
  summary?: string
  json: unknown
}> = ({ icon, label, tint, summary, json }) => (
  <details>
    <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 hover:bg-muted/40">
      <span>{icon}</span>
      <span className={`font-semibold ${tint}`}>{label}</span>
      {summary && (
        <span className="truncate text-muted-foreground/70">{summary}</span>
      )}
    </summary>
    <pre className="mx-3 mb-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
      {typeof json === "string" ? json : JSON.stringify(json, null, 2)}
    </pre>
  </details>
)

/* ── flow_context ─────────────────────────────────────── */
const FlowContextCard: FC<{ data: Record<string, any> }> = ({ data }) => (
  <div>
    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
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
    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
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
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">
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
