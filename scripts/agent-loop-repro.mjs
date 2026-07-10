/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Isolation harness for the "duplicated trigger_intent / reused call_ id" bug.
 *
 * Talks DIRECTLY to the local OpenAI-compatible model (oMLX on :8000),
 * bypassing our Next route, the AI SDK stream, useChat, and onToolCall. So:
 *   - If the model re-fires trigger_intent on the post-transition turn (S2a),
 *     the duplication is THE MODEL (ignoring the advanced state). If it also
 *     reuses the same call_ id, that confirms "oMLX reuses tool_call ids".
 *   - If S2b (fresh state re-asserted at the end, = our fix) makes it answer
 *     with TEXT instead, the reinjection fix works at the model level.
 *   - If the model always emits a single clean tool_call, the duplication is
 *     OURS/the stream (flow layer), not the model.
 *
 * Usage:
 *   # (A) synthetic scenarios reconstructed from the trace:
 *   node scripts/agent-loop-repro.mjs
 *
 *   # (B) replay YOUR captured request (most reproducible). Save the buffer with
 *   #     the real payload to a .json file first. Accepts either the ModelMessage
 *   #     / data-debug shape ({system?, messages:[{role,content:[parts]}]}) OR a
 *   #     plain OpenAI body ({messages:[{role,content|tool_calls}], tools?}).
 *   FILE=/path/to/sent.json node scripts/agent-loop-repro.mjs
 *
 *   BASE_URL=http://localhost:8000/v1 MODEL=Qwen3-4B-Instruct-2507-4bit RUNS=3 FILE=... node scripts/agent-loop-repro.mjs
 */
import { readFileSync } from "node:fs"

const BASE_URL = process.env.BASE_URL || "http://localhost:8000/v1"
const MODEL = process.env.MODEL || "Qwen3-4B-Instruct-2507-4bit"
const RUNS = Number(process.env.RUNS || 3)
const TEMP = Number(process.env.TEMP ?? 0.5)

// --- Real RULES block, copied verbatim from lib/runtime/dot-agent-injector.ts ---
const RULES_BLOCK = `<RULES>
1. Adopt the persona and behavior defined in <PERSONA>.
2. STATE TRANSITION FIRST: Evaluate if the user's message matches any intent in \`allowed_intents\`.
 - NOTE: Tolerate minor typos and infer the closest intended term before classifying a request as "offtopic" or "Out of scope".
 - IF the matched intent requires moving to a DIFFERENT state
 (e.g., needing context/data from another state, or triggering "offtopic" / "Out of scope"),
 you MUST SILENTLY call \`trigger_intent\` without generating ANY text response. Wait for the new state information.
3. GOAL EXECUTION: IF the user's message can be addressed within the current state's scope,
use the \`guide\` and \`teach\` data to generate a text response that achieves the current \`goal\`.
4. ACHIEVED GOAL: Only IF a specific conversational goal has been fully achieved during the current state,
silently call \`trigger_intent\` to move the flow forward.
5. Never explain, mention, or reveal your tool calls to the user.
</RULES>`

// Representative persona for the recipe agent seen in the trace (the exact bytes
// don't drive the re-fire; the RULES + state payloads + tool enum do).
const PERSONA = `<PERSONA>
You are a friendly vegetarian recipe assistant. You help users discover recipes,
suggest dishes from ingredients they have, and show the recipe catalog.
</PERSONA>`

const SYSTEM = `${PERSONA}\n\n${RULES_BLOCK}`

// --- FSM state payloads, taken from the user's real trace ---
const RESPONSIVE = {
  state: "responsive",
  goal: "Welcome the user and initiate interaction",
  guide:
    "Understand the user's intent and respond appropriately. If the user provides ingredients, suggest a recipe. If they ask to see the catalog, show the list of recipes.",
  allowed_intents: ["Suggest a recipe", "List recipes"]
}
const SHOW_CATALOG = {
  state: "show_catalog",
  goal: "Display the full list of recipes available to the user.",
  guide:
    "Provide a clear, formatted list of all recipes currently available in the catalog.",
  teach:
    "# Vegetarian Recipes Catalog\n\n1. Vegetable Stir-fry:\nIngredients: bell peppers, broccoli, carrots, soy sauce, tofu.\n\n2. Omelette:\nIngredients: eggs, cheese, spinach, onions.\n\n3. Pasta Primavera:\nIngredients: pasta, zucchini, cherry tomatoes, olive oil, parmesan cheese.",
  allowed_intents: ["Start over", "Out of scope", "offtopic"]
}

const USER_MSG = "oi eu quero ver a lista de receitas"

// get_current_state is injected (simulated), never a real tool — same as the route.
const stateInjection = payload => [
  {
    role: "assistant",
    content: null,
    tool_calls: [
      {
        id: "call_getstate_" + Math.random().toString(16).slice(2, 10),
        type: "function",
        function: { name: "get_current_state", arguments: "{}" }
      }
    ]
  },
  { role: "tool", tool_call_id: "PLACEHOLDER", content: JSON.stringify(payload) }
]
// wire the tool_call_id through so the pair is well-formed
function statePair(payload) {
  const pair = stateInjection(payload)
  pair[1].tool_call_id = pair[0].tool_calls[0].id
  return pair
}

const triggerIntentTool = validIntents => ({
  type: "function",
  function: {
    name: "trigger_intent",
    description:
      "Signals a state transition in the deterministic flow engine when the current state's goal is achieved or the message is off-topic.",
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
})

// The already-happened first transition: assistant fires List recipes, tool returns show_catalog.
const FIRST_TRANSITION = [
  {
    role: "assistant",
    content: null,
    tool_calls: [
      {
        id: "call_861e9693",
        type: "function",
        function: {
          name: "trigger_intent",
          arguments: JSON.stringify({ intent_name: "List recipes" })
        }
      }
    ]
  },
  {
    role: "tool",
    tool_call_id: "call_861e9693",
    content: JSON.stringify(SHOW_CATALOG)
  }
]

const scenarios = {
  "S1  first turn (responsive)": {
    messages: [
      { role: "system", content: SYSTEM },
      ...statePair(RESPONSIVE),
      { role: "user", content: USER_MSG }
    ],
    tools: [triggerIntentTool(RESPONSIVE.allowed_intents)]
  },
  "S2a resubmit OLD (state only inside trigger_intent result)": {
    messages: [
      { role: "system", content: SYSTEM },
      ...statePair(RESPONSIVE),
      { role: "user", content: USER_MSG },
      ...FIRST_TRANSITION
    ],
    tools: [triggerIntentTool(SHOW_CATALOG.allowed_intents)]
  },
  "S2b resubmit FIX (fresh state re-asserted at the end)": {
    messages: [
      { role: "system", content: SYSTEM },
      ...statePair(RESPONSIVE),
      { role: "user", content: USER_MSG },
      ...FIRST_TRANSITION,
      ...statePair(SHOW_CATALOG)
    ],
    tools: [triggerIntentTool(SHOW_CATALOG.allowed_intents)]
  }
}

// ---------------------------------------------------------------------------
// FILE mode: replay a captured request exactly as it was sent to the model.
// ---------------------------------------------------------------------------

// Convert a ModelMessage-shaped message (content is an array of typed parts,
// which is what our data-debug mirror emits) to the OpenAI chat-completions
// wire shape. Pass-through anything already in OpenAI shape.
function toOpenAI(messages) {
  const out = []
  for (const m of messages) {
    if (!Array.isArray(m.content)) {
      out.push(m) // already OpenAI-ish (string content and/or tool_calls)
      continue
    }
    if (m.role === "assistant") {
      const text = m.content.filter(p => p.type === "text").map(p => p.text).join("")
      const toolCalls = m.content
        .filter(p => p.type === "tool-call")
        .map(p => ({
          id: p.toolCallId,
          type: "function",
          function: { name: p.toolName, arguments: JSON.stringify(p.input ?? {}) }
        }))
      const msg = { role: "assistant", content: text || null }
      if (toolCalls.length) msg.tool_calls = toolCalls
      out.push(msg)
    } else if (m.role === "tool") {
      for (const p of m.content.filter(p => p.type === "tool-result")) {
        const val = p.output?.value ?? p.output
        out.push({
          role: "tool",
          tool_call_id: p.toolCallId,
          content: typeof val === "string" ? val : JSON.stringify(val)
        })
      }
    } else {
      const text = m.content
        .map(p => (typeof p === "string" ? p : p.text ?? ""))
        .join("")
      out.push({ role: m.role, content: text })
    }
  }
  return out
}

// The most recent tool result that carries allowed_intents == the current FSM
// state as the model last saw it. Used to derive the tools[] enum when the
// capture omits it, and to build the "fix" re-assertion.
function lastStatePayload(openaiMessages) {
  for (let i = openaiMessages.length - 1; i >= 0; i--) {
    const m = openaiMessages[i]
    if (m.role !== "tool" || typeof m.content !== "string") continue
    try {
      const j = JSON.parse(m.content)
      const p = j.allowed_intents ? j : j.value?.allowed_intents ? j.value : null
      if (p) return p
    } catch {}
  }
  return null
}

function loadCaptured(file) {
  const raw = JSON.parse(readFileSync(file, "utf8"))
  const msgsIn = Array.isArray(raw) ? raw : raw.messages
  if (!Array.isArray(msgsIn)) throw new Error("capture has no messages[] array")

  let messages = toOpenAI(msgsIn)
  // Ensure a system message (persona+RULES) leads, mirroring the route.
  if (raw.system && messages[0]?.role !== "system") {
    messages = [{ role: "system", content: raw.system }, ...messages]
  }

  const state = lastStatePayload(messages)
  const tools =
    raw.tools ||
    [triggerIntentTool(state?.allowed_intents || [])]

  const asIs = { messages, tools }
  const fix = state
    ? { messages: [...messages, ...statePair(state)], tools }
    : null

  // "Trim to the first transition" = the clean resubmit-decision point. Find the
  // first assistant trigger_intent call and the tool-result right after it, then
  // cut there. Given ONLY that (system + user + one trigger_intent + its result),
  // whatever the model does next is its unbiased resubmit decision — if it
  // re-fires trigger_intent here, the duplication is conclusively the model.
  let trimmed = null
  const firstCallIdx = messages.findIndex(
    m =>
      m.role === "assistant" &&
      (m.tool_calls || []).some(t => t.function?.name === "trigger_intent")
  )
  if (firstCallIdx !== -1) {
    const resultIdx = messages.findIndex(
      (m, i) => i > firstCallIdx && m.role === "tool"
    )
    if (resultIdx !== -1) {
      const slice = messages.slice(0, resultIdx + 1)
      const trimState = lastStatePayload(slice)
      const trimTools = [triggerIntentTool(trimState?.allowed_intents || [])]
      trimmed = { messages: slice, tools: trimTools, state: trimState }
    }
  }
  return { asIs, fix, trimmed, state }
}

async function call({ messages, tools }) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools,
      tool_choice: "auto",
      temperature: TEMP,
      stream: false
    })
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const j = await res.json()
  const msg = j.choices?.[0]?.message || {}
  return {
    finish: j.choices?.[0]?.finish_reason,
    content: (msg.content || "").replace(/\s+/g, " ").trim(),
    toolCalls: (msg.tool_calls || []).map(t => ({
      id: t.id,
      name: t.function?.name,
      args: t.function?.arguments
    }))
  }
}

function summarize(r) {
  const ids = r.toolCalls.map(t => t.id)
  const dupIds = ids.length !== new Set(ids).size
  const names = r.toolCalls.map(t => `${t.name}(${t.args}) [${t.id}]`).join(" , ")
  const reusedFirst = ids.includes("call_861e9693")
  return { finish: r.finish, nCalls: r.toolCalls.length, dupIds, reusedFirst, names, text: r.content.slice(0, 120) }
}

;(async () => {
  console.log(`\nmodel=${MODEL}  base=${BASE_URL}  runs=${RUNS}  temp=${TEMP}\n`)

  let runSet = scenarios
  if (process.env.FILE) {
    const cap = loadCaptured(process.env.FILE)
    console.log(
      `replaying capture: ${process.env.FILE}  (${cap.asIs.messages.length} msgs, ` +
        `last state="${cap.state?.state}", allowed=${JSON.stringify(cap.state?.allowed_intents)})`
    )
    runSet = {}
    if (cap.trimmed) {
      console.log(
        `  trimmed decision point: ${cap.trimmed.messages.length} msgs, ` +
          `state="${cap.trimmed.state?.state}", allowed=${JSON.stringify(cap.trimmed.state?.allowed_intents)}`
      )
      runSet["CAPTURE trimmed to 1st transition (clean resubmit decision)"] =
        cap.trimmed
    }
    runSet["CAPTURE as-is (exactly what was sent)"] = cap.asIs
    if (cap.fix) runSet["CAPTURE + FIX (fresh state re-asserted at the end)"] = cap.fix
  }

  for (const [name, payload] of Object.entries(runSet)) {
    console.log(`\n============================================================`)
    console.log(name)
    console.log(`============================================================`)
    for (let i = 1; i <= RUNS; i++) {
      try {
        const r = await call(payload)
        const s = summarize(r)
        const verdict =
          s.nCalls === 0
            ? "TEXT (no tool)"
            : `${s.nCalls} tool_call${s.nCalls > 1 ? "s" : ""}` +
              (s.dupIds ? " ⚠️DUP-ID-WITHIN-RESP" : "") +
              (s.reusedFirst ? " ⚠️REUSED call_861e9693" : "")
        console.log(
          `  run ${i}: finish=${s.finish} -> ${verdict}` +
            (s.names ? `\n         ${s.names}` : "") +
            (s.text ? `\n         text: "${s.text}${r.content.length > 120 ? "…" : ""}"` : "")
        )
      } catch (e) {
        console.log(`  run ${i}: ERROR ${e.message}`)
      }
    }
  }
  console.log(`\nHow to read it:`)
  console.log(`  S1 should fire trigger_intent("List recipes").`)
  console.log(`  S2a re-firing trigger_intent  => the MODEL duplicates (ignores advanced state).`)
  console.log(`  S2a reusing call_861e9693     => oMLX reuses tool_call ids (the visible dup).`)
  console.log(`  S2b answering with TEXT       => the reinjection fix works at the model level.`)
  console.log(`  All scenarios single/clean    => duplication is OURS/the stream, not the model.\n`)
})()
