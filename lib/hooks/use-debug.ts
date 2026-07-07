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

import { useContext, useEffect, useRef } from "react"
import { ChatbotUIContext } from "@/context/context"
import { FlowTurnDebug } from "@/types/flow-debug"
import { getMessageText, getToolInvocations } from "@/lib/ai/ui-message-parts"

/**
 * Hook to automatically synchronize the FSM state and Vercel AI SDK events
 * into the `flowDebugLog` without relying on network polling.
 */
export function useDebugSync(
  messages: any[],
  isLoading: boolean
) {
  const { flowState, setFlowDebugLog } = useContext(ChatbotUIContext)
  const currentSequenceRef = useRef<number>(0)

  // Track stateAtSend when a new generation starts
  useEffect(() => {
    if (isLoading && flowState) {
      const seq = ++currentSequenceRef.current
      setFlowDebugLog((prev) => ({
        ...prev,
        [seq]: {
          sequenceNumber: seq,
          stateAtSend: flowState.currentState,
          goal: flowState.goal || null,
          guide: flowState.guide || null,
          teach: flowState.teach || null,
          validIntents: flowState.validIntents || [],
          sentMessages: [],
          rawResponse: "",
          intentFound: null,
          transitionEffects: [],
          toolExchange: null
        } as FlowTurnDebug
      }))
    }
  }, [isLoading, flowState, setFlowDebugLog])

  // Sync tool calls from Vercel AI SDK messages
  useEffect(() => {
    if (!isLoading || messages.length === 0) return
    const lastMessage = messages[messages.length - 1]
    
    const toolInvocations = getToolInvocations(lastMessage)

    if (lastMessage.role === "assistant" && toolInvocations.length > 0) {
      setFlowDebugLog((prev) => {
        const seqNums = Object.keys(prev).map(Number)
        if (seqNums.length === 0) return prev
        const latestSeq = Math.max(...seqNums)
        const latest = prev[latestSeq]

        // Check if trigger_intent was called
        const intentCall = toolInvocations.find(t => t.toolName === "trigger_intent")

        return {
          ...prev,
          [latestSeq]: {
            ...latest,
            rawResponse: getMessageText(lastMessage),
            intentFound: intentCall ? (intentCall.input as any)?.intent_name : latest.intentFound,
            toolExchange: toolInvocations.map(t => ({
              role: "tool",
              content: { toolName: t.toolName, args: t.input, result: t.output ?? "pending..." }
            }))
          }
        }
      })
    }
  }, [messages, isLoading, setFlowDebugLog])
}
