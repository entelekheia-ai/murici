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

import { FlowTurnDebug } from "@/types/flow-debug"
import { FC } from "react"

interface FlowSystemDebugBubbleProps {
  debug: FlowTurnDebug
}

export const FlowSystemDebugBubble: FC<FlowSystemDebugBubbleProps> = ({
  debug
}) => {
  const content0 = debug.toolExchange?.[0]?.content
  const toolUseBlock = Array.isArray(content0)
    ? content0.find((b: any) => b.type === "tool_use")
    : null

  const content1 = debug.toolExchange?.[1]?.content
  const toolResultBlock = Array.isArray(content1)
    ? content1.find((b: any) => b.type === "tool_result")
    : null

  return (
    <div className="border-border bg-muted/20 text-muted-foreground mx-4 my-2 rounded-lg border font-mono text-xs">
      {/* Header */}
      <div className="border-border flex items-center gap-2 border-b px-3 py-2">
        <span>⚙</span>
        <span className="font-semibold text-blue-400">Sistema</span>
        <span className="text-muted-foreground/60">
          state: <strong>{debug.stateAtSend || "—"}</strong>
        </span>
        {debug.intentFound && (
          <span className="text-orange-400">
            → &quot;{debug.intentFound}&quot;
          </span>
        )}
      </div>

      {/* Enviou */}
      <details className="border-border border-b">
        <summary className="hover:bg-muted/40 cursor-pointer select-none px-3 py-1.5">
          Enviou ({debug.sentMessages.length} msgs)
        </summary>
        <pre className="bg-muted mx-3 mb-2 max-h-48 overflow-auto whitespace-pre-wrap rounded p-2 text-xs">
          {JSON.stringify(debug.sentMessages, null, 2)}
        </pre>
      </details>

      {/* Context: goal / guide / teach / intents */}
      <div className="border-border space-y-1 border-b px-3 py-1.5">
        {debug.goal && (
          <div>
            <span className="text-yellow-400">goal:</span> {debug.goal}
          </div>
        )}
        {debug.guide && (
          <div>
            <span className="text-green-400">guide:</span> {debug.guide}
          </div>
        )}
        {debug.teach && (
          <div>
            <span className="text-purple-400">teach:</span> {debug.teach}
          </div>
        )}
        <div>
          <span className="text-blue-400">intents offered:</span>{" "}
          {debug.validIntents.length > 0
            ? debug.validIntents.join(", ")
            : "none"}
        </div>
      </div>

      {/* Dashed separator */}
      <div className="border-border/60 mx-3 border-t border-dashed" />

      {/* Tool phases: Recebeu / Fez / Mandou */}
      {debug.toolExchange && (
        <>
          {/* Recebeu */}
          <div className="border-border border-b px-3 py-1.5">
            <span className="font-semibold text-orange-400">Recebeu:</span>{" "}
            {toolUseBlock ? (
              <>
                {toolUseBlock.name}({JSON.stringify(toolUseBlock.input ?? {})})
              </>
            ) : debug.intentFound ? (
              <>trigger_intent(&quot;{debug.intentFound}&quot;)</>
            ) : (
              <span className="opacity-60">tool call</span>
            )}
            <details className="mt-1">
              <summary className="cursor-pointer select-none opacity-60 hover:opacity-70">
                raw
              </summary>
              <pre className="bg-muted mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded p-2">
                {JSON.stringify(debug.toolExchange[0], null, 2)}
              </pre>
            </details>
          </div>

          {/* Fez */}
          <div className="border-border border-b px-3 py-1.5">
            <span className="font-semibold text-green-400">Fez:</span>{" "}
            {debug.transitionEffects.length > 0 ? (
              <details className="mt-1">
                <summary className="cursor-pointer select-none hover:opacity-70">
                  {debug.transitionEffects.length} efeito(s)
                </summary>
                <pre className="bg-muted mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded p-2">
                  {JSON.stringify(debug.transitionEffects, null, 2)}
                </pre>
              </details>
            ) : (
              <span className="opacity-60">nenhuma transição</span>
            )}
          </div>

          {/* Mandou */}
          <div className="border-border border-b px-3 py-1.5">
            <span className="font-semibold text-blue-400">Mandou:</span>{" "}
            {toolResultBlock ? (
              <details className="mt-1">
                <summary className="cursor-pointer select-none hover:opacity-70">
                  tool result
                </summary>
                <pre className="bg-muted mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded p-2">
                  {JSON.stringify(debug.toolExchange[1], null, 2)}
                </pre>
              </details>
            ) : (
              <span className="opacity-60">—</span>
            )}
          </div>
        </>
      )}

      {/* Resposta bruta */}
      <details className="px-3 py-1.5">
        <summary className="cursor-pointer select-none opacity-60 hover:opacity-70">
          Resposta bruta
        </summary>
        <pre className="bg-muted mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded p-2">
          {debug.rawResponse}
        </pre>
      </details>
    </div>
  )
}
