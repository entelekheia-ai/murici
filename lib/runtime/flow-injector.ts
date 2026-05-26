export interface FlowStateInfo {
  currentState: string
  goal?: string
  guide?: string
  teach?: string
  validIntents: string[]
}

export function injectFlowContext(
  messages: any[],
  flowState: FlowStateInfo | null
): any[] {
  if (!flowState || !flowState.currentState) {
    return messages
  }

  // Remove previous injections to keep history stateless
  const clean = messages.filter(m => !m.content?.includes("[FLOW_CONTEXT]"))

  const intentsList = flowState.validIntents.map(i => `"${i}"`).join(", ")

  let flowBlock = `[FLOW_CONTEXT]\nCurrent State: "${flowState.currentState}"\n`
  if (flowState.goal) flowBlock += `Goal: "${flowState.goal}"\n`
  if (flowState.teach) flowBlock += `\nKnowledge:\n${flowState.teach}\n`
  if (flowState.validIntents.length > 0) {
    flowBlock += `Available intents: [${intentsList}]\n`
    if (flowState.goal) {
      flowBlock += `When the goal of this state is achieved, call the "trigger_intent" tool with the appropriate intent name. Do not mention the tool call to the user.\n`
    } else {
      flowBlock += `Classify the user's message into one of the available intents and immediately call the "trigger_intent" tool with the matching intent name. Do not mention the tool call to the user.\n`
    }
  }
  flowBlock += `[/FLOW_CONTEXT]`

  const systemIdx = clean.findIndex(m => m.role === "system")
  if (systemIdx !== -1) {
    clean[systemIdx] = {
      ...clean[systemIdx],
      content: flowBlock + "\n\n" + clean[systemIdx].content
    }
  } else {
    clean.unshift({ role: "system", content: flowBlock })
  }

  // Guide: inject into the last user message content (no extra role)
  if (flowState.guide) {
    const lastUserIdx = clean.map(m => m.role).lastIndexOf("user")
    if (lastUserIdx !== -1) {
      const orig =
        typeof clean[lastUserIdx].content === "string"
          ? clean[lastUserIdx].content
          : JSON.stringify(clean[lastUserIdx].content)
      clean[lastUserIdx] = {
        ...clean[lastUserIdx],
        content: `[Style: ${flowState.guide}]\n${orig}`
      }
    }
  }

  return clean
}

export function buildTriggerIntentTool(validIntents: string[]) {
  return {
    type: "function",
    function: {
      name: "trigger_intent",
      description:
        "Signals a state transition in the deterministic flow engine when the current state's goal is achieved. Call this only when the conversation goal has been fulfilled.",
      parameters: {
        type: "object",
        properties: {
          intent_name: {
            type: "string",
            enum: validIntents,
            description: "The exact intent name to trigger."
          }
        },
        required: ["intent_name"]
      }
    }
  }
}
