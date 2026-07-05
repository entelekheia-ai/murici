/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

// Only used in use-chat-handler.tsx to keep it clean

import { createChat } from "@/db/chats"
import { getModelById } from "@/db/models"
import { createMessages, updateMessage } from "@/db/messages"
import {
  createChatFiles,
  createMessageFileItems,
  uploadMessageImage
} from "@/lib/local-db/stubs"
import {
  buildFinalMessages,
  adaptMessagesForGoogleGemini
} from "@/lib/build-prompt"
import {
  buildTriggerIntentTool,
  FlowStateInfo
} from "@/lib/runtime/flow-injector"
import { consumeReadableStream } from "@/lib/consume-stream"
import { Tables, TablesInsert } from "@/types/database"
import {
  ChatFile,
  ChatMessage,
  ChatPayload,
  ChatSettings,
  FlowEvent,
  LLM,
  MessageImage
} from "@/types"
import { KnowledgeRecord } from "@/types/knowledge"
import { createKnowledgeRecord } from "@/lib/local-db/knowledge"
import { buildKnowledgeRecords } from "@/lib/knowledge/extract"
import { triggerEnrichment } from "@/lib/knowledge/enrich"
import { t } from "@/lib/i18n-instance"
import React from "react"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"

// Local inference servers (oMLX, LM Studio, Ollama, LocalAI, vLLM...) surface
// failures as plain HTTP status codes with engine-specific bodies. Map the
// common ones to a cause a non-technical user can act on, so failures show
// up in the chat/toast instead of only in devtools console.
function describeLocalServerError(status: number, bodyText: string): string {
  const snippet = bodyText.trim().slice(0, 300)
  switch (status) {
    case 507:
      return t(
        "Local model server is out of disk space (cache full). Clear the engine's cache and try again."
      )
    case 503:
      return t(
        "Local model server is unavailable — it may be loading the model or overloaded. Try again shortly."
      )
    case 502:
    case 504:
      return t(
        "Local model server did not respond in time (gateway/timeout). Check whether the engine is still running."
      )
    case 429:
      return t(
        "Local model server rejected the request due to too many concurrent calls."
      )
    case 401:
    case 403:
      return t(
        "Authentication with the local model server failed. Check the API key configured for the engine."
      )
    case 404:
      return t(
        "Model not found on the local server. It may have been unloaded or renamed."
      )
    default:
      return snippet
        ? t("Local model server returned error {{status}}: {{snippet}}", {
            status,
            snippet
          })
        : t("Local model server returned error {{status}}", { status })
  }
}

async function resolveCustomModel(hostedId: string | undefined) {
  if (!hostedId) return undefined
  const m = await getModelById(hostedId)
  if (!m) return undefined
  return { api_key: m.api_key, base_url: m.base_url, model_id: m.model_id }
}

function buildApiKeys(profile: Tables<"profiles">) {
  return {
    openai: profile.openai_api_key ?? undefined,
    anthropic: profile.anthropic_api_key ?? undefined,
    google: profile.google_gemini_api_key ?? undefined,
    mistral: profile.mistral_api_key ?? undefined,
    groq: profile.groq_api_key ?? undefined,
    perplexity: profile.perplexity_api_key ?? undefined,
    azure: profile.azure_openai_api_key ?? undefined,
    openrouter: profile.openrouter_api_key ?? undefined,
    openaiOrgId: profile.openai_organization_id ?? undefined,
    azureEndpoint: profile.azure_openai_endpoint ?? undefined,
    azure35TurboId: profile.azure_openai_35_turbo_id ?? undefined,
    azure45TurboId: profile.azure_openai_45_turbo_id ?? undefined,
    azure45VisionId: profile.azure_openai_45_vision_id ?? undefined,
    azureEmbeddingsId: profile.azure_openai_embeddings_id ?? undefined,
    useAzure: profile.use_azure_openai
  }
}

export const validateChatSettings = (
  chatSettings: ChatSettings | null,
  modelData: LLM | undefined,
  profile: Tables<"profiles"> | null,
  selectedWorkspace: Tables<"workspaces"> | null,
  messageContent: string
) => {
  if (!chatSettings) {
    throw new Error("Chat settings not found")
  }

  if (!modelData) {
    throw new Error("Model not found")
  }

  if (!profile) {
    throw new Error("Profile not found")
  }

  if (!selectedWorkspace) {
    throw new Error("Workspace not found")
  }

  if (!messageContent) {
    throw new Error("Message content not found")
  }
}

export const handleRetrieval = async (
  userInput: string,
  newMessageFiles: ChatFile[],
  chatFiles: ChatFile[],
  embeddingsProvider: "openai" | "local",
  sourceCount: number
) => {
  const response = await fetch("/api/retrieval/retrieve", {
    method: "POST",
    body: JSON.stringify({
      userInput,
      fileIds: [...newMessageFiles, ...chatFiles].map(file => file.id),
      embeddingsProvider,
      sourceCount
    })
  })

  if (!response.ok) {
    console.error("Error retrieving:", response)
  }

  const { results } = (await response.json()) as {
    results: Tables<"file_items">[]
  }

  return results
}

export const createTempMessages = (
  messageContent: string,
  chatMessages: ChatMessage[],
  chatSettings: ChatSettings,
  b64Images: string[],
  isRegeneration: boolean,
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  selectedAssistant: Tables<"assistants"> | null
) => {
  let tempUserChatMessage: ChatMessage = {
    message: {
      chat_id: "",
      assistant_id: null,
      content: messageContent,
      created_at: "",
      id: uuidv4(),
      image_paths: b64Images,
      model: chatSettings.model,
      role: "user",
      sequence_number: chatMessages.length,
      updated_at: "",
      user_id: ""
    },
    fileItems: []
  }

  let tempAssistantChatMessage: ChatMessage = {
    message: {
      chat_id: "",
      assistant_id: selectedAssistant?.id || null,
      content: "",
      created_at: "",
      id: uuidv4(),
      image_paths: [],
      model: chatSettings.model,
      role: "assistant",
      sequence_number: chatMessages.length + 1,
      updated_at: "",
      user_id: ""
    },
    fileItems: []
  }

  let newMessages = []

  if (isRegeneration) {
    const lastMessageIndex = chatMessages.length - 1
    chatMessages[lastMessageIndex].message.content = ""
    newMessages = [...chatMessages]
  } else {
    newMessages = [
      ...chatMessages,
      tempUserChatMessage,
      tempAssistantChatMessage
    ]
  }

  setChatMessages(newMessages)

  return {
    tempUserChatMessage,
    tempAssistantChatMessage
  }
}


export async function getMcpAndBuiltInTools(flowState?: FlowStateInfo): Promise<any[]> {
  const tools: any[] = [
    {
      type: "function",
      function: {
        name: "murici__save_doc",
        description: "Save structured knowledge to the chat. Use this when the user asks you to save a document, summarize a topic for future reference, or extract a specific piece of knowledge.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "A short, descriptive title for the document." },
            theme: { type: "string", description: "The general theme or topic." },
            summary: { type: "string", description: "A one-sentence summary of the content." },
            content: { type: "string", description: "The full content of the document, formatted in markdown." }
          },
          required: ["title", "theme", "summary", "content"]
        }
      }
    }
  ]

  if (flowState && flowState.validIntents) {
    tools.push(buildTriggerIntentTool(flowState.validIntents))
    tools.push({
      type: "function",
      function: {
        name: "murici__state_graph",
        description: "Get the current state graph of the active FSM agent, showing all possible states and transitions.",
        parameters: { type: "object", properties: {} }
      }
    })
  }

  try {
    const res = await fetch("/api/mcp/tools")
    if (res.ok) {
      const data = await res.json()
      for (const server of data) {
        for (const tool of server.tools) {
          tools.push({
            type: "function",
            function: {
              name: `mcp__${server.serverName}__${tool.name}`,
              description: tool.description,
              parameters: tool.inputSchema
            }
          })
        }
      }
    }
  } catch (e) {
    console.error("Failed to fetch MCP tools", e)
  }

  return tools
}

export async function executeToolLoopAndStream(
  messages: any[],
  tools: any[],
  chatSettings: ChatSettings,
  isLocal: boolean,
  localBaseUrl: string,
  localHeaders: Record<string, string>,
  apiEndpoint: string,
  customModel: any,
  profile: Tables<"profiles">,
  targetId: string,
  setFirstTokenReceived: React.Dispatch<React.SetStateAction<boolean>>,
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  onEvent?: (event: Pick<FlowEvent, "type" | "data">) => void,
  onThinkingUpdate?: (thinking: string) => void,
  flowState?: FlowStateInfo
): Promise<{
  content: string
  thinking: string | null
  intentName: string | null
  toolExchange: Array<{ role: string; content: any; tool_calls?: any[]; tool_call_id?: string }> | null
}> {
  let content = ""
  let thinking: string | null = null
  let intentName: string | null = null
  let toolExchange: Array<{ role: string; content: any; tool_calls?: any[]; tool_call_id?: string }> | null = null

  const doStream = async (
    exchangeMessages: Array<{ role: string; content: any; tool_calls?: any[]; tool_call_id?: string }>,
    indicatorText: string
  ) => {
    if (exchangeMessages.length > 0) {
      toolExchange = exchangeMessages
      onEvent?.({ type: "second_turn", data: {} })
    }
    content = indicatorText
    setFirstTokenReceived(true)
    setChatMessages(prev =>
      prev.map(m =>
        m.message.id === targetId
          ? { ...m, message: { ...m.message, content } }
          : m
      )
    )

    let res2;
    let connectError: any = null
    try {
      res2 = isLocal
        ? await fetch(`${localBaseUrl}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...localHeaders },
            body: JSON.stringify({
              model: chatSettings.model,
              messages: [...messages, ...exchangeMessages],
              temperature: chatSettings.temperature,
              stream: true
            })
          })
        : await fetch(apiEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chatSettings,
              messages: [...messages, ...exchangeMessages.map(m => ({ ...m }))],
              customModel,
              apiKeys: buildApiKeys(profile)
            })
          })
    } catch (e) {
      connectError = e
      console.error(`[executeToolLoopAndStream] fetch to ${isLocal ? localBaseUrl : apiEndpoint} threw:`, e)
    }

    if (res2 && res2.ok && res2.body) {
      let rawAccum = ""
      let reasoningAccum = ""
      await consumeReadableStream(
        res2.body,
        chunk => {
          if (isLocal) {
            for (const line of chunk.split("\n")) {
              if (!line.startsWith("data: ") || line === "data: [DONE]") continue
              try {
                const json = JSON.parse(line.slice(6))
                const delta = json.choices?.[0]?.delta
                if (!delta) continue
                rawAccum += delta.content ?? ""
                if (delta.reasoning_content) {
                  reasoningAccum += delta.reasoning_content
                  onThinkingUpdate?.(reasoningAccum)
                }
              } catch {}
            }
            content = indicatorText + rawAccum
          } else {
            rawAccum += chunk
            const { displayText, thinkingText } = sanitizeStreamText(rawAccum)
            content = indicatorText + displayText
            if (thinkingText) {
              thinking = thinkingText
              onThinkingUpdate?.(thinkingText)
            }
          }
          setChatMessages(prev =>
            prev.map(m =>
              m.message.id === targetId
                ? { ...m, message: { ...m.message, content } }
                : m
            )
          )
        },
        new AbortController().signal
      )
    } else {
      let cause: string
      if (connectError) {
        cause = isLocal
          ? t(
              "Could not connect to the local model server at {{baseUrl}}. Check whether the engine is running.",
              { baseUrl: localBaseUrl }
            )
          : t("Could not connect to {{endpoint}}.", { endpoint: apiEndpoint })
      } else if (res2) {
        const bodyText = await res2.text().catch(() => "")
        console.error(
          `[executeToolLoopAndStream] stream request failed: status=${res2.status} url=${res2.url} body=${bodyText.slice(0, 500)}`
        )
        cause = isLocal
          ? describeLocalServerError(res2.status, bodyText)
          : t("Request failed (status {{status}}).", { status: res2.status })
      } else {
        cause = t("Unknown failure while contacting the model.")
      }
      console.error("[executeToolLoopAndStream] stream request failed:", cause)
      toast.error(cause)
      content = `⚠️ ${cause}`
      setChatMessages(prev =>
        prev.map(m =>
          m.message.id === targetId
            ? { ...m, message: { ...m.message, content } }
            : m
        )
      )
    }
  }

  if (tools.length === 0) {
    await doStream([], "")
    return { content, thinking, intentName, toolExchange }
  }

  let res: Response;
  try {
    res = isLocal
      ? await fetch(`${localBaseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...localHeaders },
          body: JSON.stringify({
            model: chatSettings.model,
            messages,
            tools,
            temperature: chatSettings.temperature,
            stream: false
          })
        })
      : await fetch(apiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatSettings,
            messages,
            tools,
            customModel,
            apiKeys: buildApiKeys(profile)
          })
        })

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "")
      const err: any = new Error(
        (() => {
          try {
            return JSON.parse(bodyText).message || "Chat request failed"
          } catch {
            return "Chat request failed"
          }
        })()
      )
      err.status = res.status
      err.bodyText = bodyText
      throw err
    }
  } catch (err: any) {
    if (isLocal) {
      console.warn(
        `[executeToolLoopAndStream] tools-call request failed (status=${err.status ?? "n/a"}), falling back to streaming without tools:`,
        err.bodyText?.slice(0, 500) ?? err.message
      )
      await doStream([], "")
      return { content, thinking, intentName, toolExchange }
    }
    throw err
  }

  const data = await res.json()
  const msg = data.choices?.[0]?.message
    content = msg?.content ?? ""
  
    let toolCalls = msg?.tool_calls
  if (!toolCalls && msg?.function_call) {
    toolCalls = [{
      id: "call_" + Math.random().toString(36).substring(7),
      type: "function",
      function: msg.function_call
    }]
  }
  
  if (toolCalls && toolCalls.length > 0 && !content) {
        const toolExchangeMsg: any[] = []
    const assistantMsg = {
      role: "assistant",
      content: msg.content ?? "",
      tool_calls: toolCalls
    }
    toolExchangeMsg.push(assistantMsg)

    for (const call of toolCalls) {
      const name = call.function?.name
      const argsStr = call.function?.arguments || "{}"
      
      let toolResult = "ok"

      if (name === "trigger_intent") {
        try {
          intentName = JSON.parse(argsStr)?.intent_name ?? null
        } catch {}
        onEvent?.({ type: "tool_call", data: { intentName, raw: call } })
      } else if (name === "murici__state_graph") {
        toolResult = JSON.stringify({ graph: flowState?.graph || "No graph available" })
      } else if (name === "murici__save_doc") {
        toolResult = JSON.stringify({ status: "Document saved successfully." })
      } else if (name?.startsWith("mcp__")) {
        const parts = name.split("__")
        const serverName = parts[1]
        const toolName = parts[2]
        try {
          const executeRes = await fetch("/api/mcp/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ serverName, toolName, args: JSON.parse(argsStr) })
          })
          if (executeRes.ok) {
            const resJson = await executeRes.json()
            toolResult = JSON.stringify(resJson)
          } else {
            toolResult = "Error executing tool"
          }
        } catch (e: any) {
          toolResult = e.message
        }
      }

      toolExchangeMsg.push({ role: "tool", tool_call_id: call.id, content: toolResult })
    }

    await doStream(toolExchangeMsg, "")
  } else {
    if (content && !thinking) {
      const { displayText, thinkingText, foundTool } = sanitizeStreamText(content)
      if (thinkingText) {
        thinking = thinkingText
        onThinkingUpdate?.(thinkingText)
      }
      if (foundTool && !intentName) {
        if (foundTool.name === "trigger_intent") {
          intentName = foundTool.arguments?.intent_name ?? null
          onEvent?.({ type: "tool_call", data: { intentName, raw: foundTool } })
        }
      }
      content = displayText
    }

    setFirstTokenReceived(true)
    setChatMessages(prev =>
      prev.map(m =>
        m.message.id === targetId
          ? { ...m, message: { ...m.message, content } }
          : m
      )
    )
  }

  return { content, thinking, intentName, toolExchange }
}


export const handleLocalChat = async (
  payload: ChatPayload,
  profile: Tables<"profiles">,
  chatSettings: ChatSettings,
  modelData: LLM,
  tempAssistantMessage: ChatMessage,
  isRegeneration: boolean,
  newAbortController: AbortController,
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>,
  setFirstTokenReceived: React.Dispatch<React.SetStateAction<boolean>>,
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setToolInUse: React.Dispatch<React.SetStateAction<string>>,
  onThinkingUpdate?: (thinking: string) => void
) => {
  const formattedMessages = await buildFinalMessages(payload, profile, [])

  const baseUrl =
    modelData.baseUrl ??
    process.env.NEXT_PUBLIC_OLLAMA_URL ??
    "http://localhost:11434"

  const headers: Record<string, string> = {}
  if (modelData.apiKey) headers["Authorization"] = `Bearer ${modelData.apiKey}`

  const tools = await getMcpAndBuiltInTools()

  return await executeToolLoopAndStream(
    formattedMessages,
    tools,
    chatSettings,
    true,
    baseUrl,
    headers,
    "",
    undefined,
    profile,
    isRegeneration
      ? payload.chatMessages[payload.chatMessages.length - 1].message.id
      : tempAssistantMessage.message.id,
    setFirstTokenReceived,
    setChatMessages,
    undefined,
    onThinkingUpdate
  )
}


export const handleFlowChat = async (
  payload: ChatPayload,
  profile: Tables<"profiles">,
  modelData: LLM,
  tempAssistantChatMessage: ChatMessage,
  isRegeneration: boolean,
  chatImages: MessageImage[],
  flowState: FlowStateInfo,
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setFirstTokenReceived: React.Dispatch<React.SetStateAction<boolean>>,
  onFinalMessages?: (messages: any[]) => void,
  onThinkingUpdate?: (thinking: string) => void,
  onEvent?: (event: Pick<FlowEvent, "type" | "data">) => void
): Promise<{
  content: string
  thinking: string | null
  intentName: string | null
  toolExchange: Array<{ role: string; content: any }> | null
}> => {
  const messages = await buildFinalMessages(
    payload,
    profile,
    chatImages,
    onFinalMessages
  )
  
  const tools = await getMcpAndBuiltInTools(flowState)

  const isLocal = modelData.provider === "local"
  const localBaseUrl =
    modelData.baseUrl ??
    process.env.NEXT_PUBLIC_OLLAMA_URL ??
    "http://localhost:11434"
  const localHeaders: Record<string, string> = {
    "Content-Type": "application/json"
  }
  if (modelData.apiKey) localHeaders["Authorization"] = `Bearer ${modelData.apiKey}`

  const provider =
    modelData.provider === "openai" && profile.use_azure_openai
      ? "azure"
      : modelData.provider
  const apiEndpoint =
    provider === "custom" ? "/api/chat/custom" : `/api/chat/${provider}`

  const customModel =
    provider === "custom"
      ? await resolveCustomModel(modelData.hostedId)
      : undefined

  const targetId = isRegeneration
    ? payload.chatMessages[payload.chatMessages.length - 1].message.id
    : tempAssistantChatMessage.message.id

  return await executeToolLoopAndStream(
    messages,
    tools,
    payload.chatSettings,
    isLocal,
    localBaseUrl,
    localHeaders,
    apiEndpoint,
    customModel,
    profile,
    targetId,
    setFirstTokenReceived,
    setChatMessages,
    onEvent,
    onThinkingUpdate,
    flowState
  )
}


export const handleHostedChat = async (
  payload: ChatPayload,
  profile: Tables<"profiles">,
  modelData: LLM,
  tempAssistantChatMessage: ChatMessage,
  isRegeneration: boolean,
  newAbortController: AbortController,
  newMessageImages: MessageImage[],
  chatImages: MessageImage[],
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>,
  setFirstTokenReceived: React.Dispatch<React.SetStateAction<boolean>>,
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setToolInUse: React.Dispatch<React.SetStateAction<string>>,
  onFinalMessages?: (messages: any[]) => void,
  onThinkingUpdate?: (thinking: string) => void
) => {
  const provider =
    modelData.provider === "openai" && profile.use_azure_openai
      ? "azure"
      : modelData.provider

  let draftMessages = await buildFinalMessages(
    payload,
    profile,
    chatImages,
    onFinalMessages
  )

  let formattedMessages: any[] = []
  if (provider === "google") {
    formattedMessages = await adaptMessagesForGoogleGemini(
      payload,
      draftMessages
    )
  } else {
    formattedMessages = draftMessages
  }

  const apiEndpoint =
    provider === "custom" ? "/api/chat/custom" : `/api/chat/${provider}`

  const customModel =
    provider === "custom"
      ? await resolveCustomModel(modelData.hostedId)
      : undefined

  const tools = await getMcpAndBuiltInTools()

  return await executeToolLoopAndStream(
    formattedMessages,
    tools,
    payload.chatSettings,
    false,
    "",
    {},
    apiEndpoint,
    customModel,
    profile,
    isRegeneration
      ? payload.chatMessages[payload.chatMessages.length - 1].message.id
      : tempAssistantChatMessage.message.id,
    setFirstTokenReceived,
    setChatMessages,
    undefined,
    onThinkingUpdate
  )
}


export const fetchChatResponse = async (
  url: string,
  body: object,
  isHosted: boolean,
  controller: AbortController,
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>,
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  extraHeaders?: Record<string, string>
) => {
  const response = await fetch(url, {
    method: "POST",
    body: JSON.stringify(body),
    signal: controller.signal,
    headers: { "Content-Type": "application/json", ...extraHeaders }
  })

  if (!response.ok) {
    if (response.status === 404 && !isHosted) {
      toast.error(
        "Model not found. Make sure you have it downloaded via Ollama."
      )
    }

    const errorData = await response.json()

    toast.error(errorData.message)

    setIsGenerating(false)
    setChatMessages(prevMessages => prevMessages.slice(0, -2))
  }

  return response
}

export function sanitizeStreamText(raw: string): {
  displayText: string
  thinkingText: string
  foundTool: any | null
} {
  let displayText = raw
  let thinkingText = ""
  let foundTool = null

  // 1. Extract <think> blocks (for local models that output raw tags)
  const thinkStartTag = "<think>"
  const thinkEndTag = "</think>"
  while (true) {
    let tStartIdx = displayText.indexOf(thinkStartTag)
    if (tStartIdx !== -1) {
      const tEndIdx = displayText.indexOf(thinkEndTag, tStartIdx)
      const pre = displayText.slice(0, tStartIdx)
      if (tEndIdx === -1) {
        thinkingText += (thinkingText ? "\n" : "") + displayText.slice(tStartIdx + thinkStartTag.length)
        displayText = pre
        break
      } else {
        thinkingText += (thinkingText ? "\n" : "") + displayText.slice(tStartIdx + thinkStartTag.length, tEndIdx)
        const post = displayText.slice(tEndIdx + thinkEndTag.length).trimStart()
        displayText = pre + post
      }
    } else {
      break
    }
  }

  // 2. Extract <tool_call> fallback
  const toolStartTag = "<tool_call>"
  const toolEndTag = "</tool_call>"
  while (true) {
    let toolStartIdx = displayText.indexOf(toolStartTag)
    if (toolStartIdx !== -1) {
      const toolEndIdx = displayText.indexOf(toolEndTag, toolStartIdx)
      const pre = displayText.slice(0, toolStartIdx)
      if (toolEndIdx === -1) {
        displayText = pre
        break
      } else {
        const toolText = displayText.slice(toolStartIdx + toolStartTag.length, toolEndIdx)
        const post = displayText.slice(toolEndIdx + toolEndTag.length).trimStart()
        displayText = pre + post
        
        const funcMatch = toolText.match(/<function=([^>]+)>/)
        if (funcMatch) {
          const funcName = funcMatch[1].trim()
          const params: Record<string, any> = {}
          const paramRegex = /<parameter=([^>]+)>([\s\S]*?)<\/parameter>/g
          let pMatch;
          while ((pMatch = paramRegex.exec(toolText)) !== null) {
            params[pMatch[1].trim()] = pMatch[2].trim()
          }
          foundTool = { name: funcName, arguments: params }
        }
      }
    } else {
      break
    }
  }

  return { displayText, thinkingText, foundTool }
}

export const processResponse = async (
  response: Response,
  lastChatMessage: ChatMessage,
  isHosted: boolean,
  controller: AbortController,
  setFirstTokenReceived: React.Dispatch<React.SetStateAction<boolean>>,
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setToolInUse: React.Dispatch<React.SetStateAction<string>>,
  onThinkingUpdate?: (thinking: string) => void
) => {
  let rawAccum = ""
  let lastDisplayText = ""
  let contentToAdd = ""

  let reasoningAccum = ""

  if (response.body) {
    await consumeReadableStream(
      response.body,
      chunk => {
        setFirstTokenReceived(true)
        setToolInUse("none")

        try {
          if (isHosted) {
            contentToAdd = chunk
          } else {
            // OpenAI-compatible SSE: chunks may have multiple "data: {...}" lines.
            // Some models (e.g. Qwen3, DeepSeek) send reasoning via delta.reasoning_content
            // instead of wrapping it in <think> tags inside delta.content.
            for (const line of chunk.split("\n")) {
              if (!line.startsWith("data: ") || line === "data: [DONE]") continue
              try {
                const json = JSON.parse(line.slice(6))
                const delta = json.choices?.[0]?.delta
                if (!delta) continue
                contentToAdd += delta.content ?? ""
                if (delta.reasoning_content) {
                  reasoningAccum += delta.reasoning_content
                  onThinkingUpdate?.(reasoningAccum)
                }
              } catch {
                // malformed line, skip
              }
            }
          }
          rawAccum += contentToAdd
          contentToAdd = ""
        } catch (error) {
          console.error("Error parsing JSON:", error)
        }

        const { displayText, thinkingText } = sanitizeStreamText(rawAccum)
        lastDisplayText = displayText

        if (onThinkingUpdate && thinkingText) {
          onThinkingUpdate(thinkingText)
        }

        setChatMessages(prev =>
          prev.map(chatMessage => {
            if (chatMessage.message.id === lastChatMessage.message.id) {
              const updatedChatMessage: ChatMessage = {
                message: {
                  ...chatMessage.message,
                  content: displayText
                },
                fileItems: chatMessage.fileItems
              }

              return updatedChatMessage
            }

            return chatMessage
          })
        )
      },
      controller.signal
    )

    return lastDisplayText
  } else {
    throw new Error("Response body is null")
  }
}

export const handleCreateChat = async (
  chatSettings: ChatSettings,
  profile: Tables<"profiles">,
  selectedWorkspace: Tables<"workspaces">,
  messageContent: string,
  selectedAssistant: Tables<"assistants">,
  newMessageFiles: ChatFile[],
  setSelectedChat: React.Dispatch<React.SetStateAction<Tables<"chats"> | null>>,
  setChats: React.Dispatch<React.SetStateAction<Tables<"chats">[]>>,
  setChatFiles: React.Dispatch<React.SetStateAction<ChatFile[]>>
) => {
  const createdChat = await createChat({
    user_id: profile.user_id,
    workspace_id: selectedWorkspace.id,
    assistant_id: selectedAssistant?.id || null,
    context_length: chatSettings.contextLength,
    include_profile_context: chatSettings.includeProfileContext,
    include_workspace_instructions: chatSettings.includeWorkspaceInstructions,
    model: chatSettings.model,
    name: messageContent.substring(0, 100),
    prompt: chatSettings.prompt,
    temperature: chatSettings.temperature,
    embeddings_provider: chatSettings.embeddingsProvider
  })

  setSelectedChat(createdChat)
  setChats(chats => [createdChat, ...chats])

  await createChatFiles(
    newMessageFiles.map(file => ({
      user_id: profile.user_id,
      chat_id: createdChat.id,
      file_id: file.id
    }))
  )

  setChatFiles(prev => [...prev, ...newMessageFiles])

  return createdChat
}

export const handleCreateMessages = async (
  chatMessages: ChatMessage[],
  currentChat: Tables<"chats">,
  profile: Tables<"profiles">,
  modelData: LLM,
  messageContent: string,
  generatedText: string,
  newMessageImages: MessageImage[],
  isRegeneration: boolean,
  retrievedFileItems: Tables<"file_items">[],
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setChatFileItems: React.Dispatch<
    React.SetStateAction<Tables<"file_items">[]>
  >,
  setChatImages: React.Dispatch<React.SetStateAction<MessageImage[]>>,
  selectedAssistant: Tables<"assistants"> | null,
  setKnowledge?: React.Dispatch<React.SetStateAction<KnowledgeRecord[]>>,
  backgroundModel?: LLM | null,
  setBackgroundQueue?: React.Dispatch<React.SetStateAction<any[]>>,
  toolExchange?: Array<{ role: string; content: any; tool_calls?: any[]; tool_call_id?: string }> | null
) => {
  const finalUserMessage: TablesInsert<"messages"> = {
    chat_id: currentChat.id,
    assistant_id: null,
    user_id: profile.user_id,
    content: messageContent,
    model: modelData.modelId,
    role: "user",
    sequence_number: chatMessages.length,
    image_paths: []
  }

  const finalAssistantMessage: TablesInsert<"messages"> = {
    chat_id: currentChat.id,
    assistant_id: selectedAssistant?.id || null,
    user_id: profile.user_id,
    content: generatedText,
    model: modelData.modelId,
    role: "assistant",
    sequence_number: chatMessages.length + 1,
    image_paths: []
  }

  let finalChatMessages: ChatMessage[] = []

  if (isRegeneration) {
    const lastStartingMessage = chatMessages[chatMessages.length - 1].message

    const updatedMessage = await updateMessage(lastStartingMessage.id, {
      ...lastStartingMessage,
      content: generatedText
    })

    chatMessages[chatMessages.length - 1].message = updatedMessage

    finalChatMessages = [...chatMessages]

    setChatMessages(finalChatMessages)
  } else {
    const messagesToInsert: TablesInsert<"messages">[] = [finalUserMessage]
    let seqOffset = 1
    const finalChatMessagesAddition: ChatMessage[] = []

    if (toolExchange && toolExchange.length > 0) {
      for (const tMsg of toolExchange) {
        // filter out internal trigger_intent to keep it ephemeral
        if (tMsg.tool_calls?.some((c:any) => c.function?.name === "trigger_intent")) {
          continue
        }
        if (tMsg.role === "tool" && tMsg.content === "ok") {
          continue // likely trigger_intent response
        }

        const msgRecord: TablesInsert<"messages"> = {
          chat_id: currentChat.id,
          assistant_id: selectedAssistant?.id || null,
          user_id: profile.user_id,
          content: typeof tMsg.content === "string" ? tMsg.content : JSON.stringify(tMsg.content),
          model: modelData.modelId,
          role: tMsg.role as any,
          sequence_number: chatMessages.length + seqOffset,
          tool_calls: tMsg.tool_calls,
          tool_call_id: tMsg.tool_call_id,
          image_paths: []
        }
        messagesToInsert.push(msgRecord)
        seqOffset++
      }
    }

    finalAssistantMessage.sequence_number = chatMessages.length + seqOffset
    messagesToInsert.push(finalAssistantMessage)

    const createdMessages = await createMessages(messagesToInsert)
    const finalCreatedAssistantMessage = createdMessages[createdMessages.length - 1]

        if (toolExchange && toolExchange.length > 0) {
      for (const tMsg of toolExchange) {
        if (tMsg.role === "assistant" && tMsg.tool_calls) {
          for (const call of tMsg.tool_calls) {
                        if (call.function?.name === "murici__save_doc") {
              try {
                const args = JSON.parse(call.function.arguments)
                const { getAgentBundle } = await import("@/lib/local-db/agent-bundles")
                const bundle = await getAgentBundle(currentChat.id)
                const record = {
                  id: uuidv4(),
                  nodeType: "knowledge" as const,
                  originConversationId: currentChat.id,
                  messageId: finalCreatedAssistantMessage.id,
                  sourcePromptMessageId: createdMessages[0].id,
                  title: args.title,
                  summary: args.summary,
                  outputType: args.theme || "GeneralContent",
                  payload: {
                    language: "md",
                    content: args.content
                  },
                  derivedFrom: [],
                  agentRuns: bundle?.aboutme.id
                    ? [{ agentId: bundle.aboutme.id, runAt: new Date().toISOString(), role: "produced" as const }]
                    : [],
                  createdAt: new Date().toISOString()
                }
                                const { createKnowledgeRecord } = await import("@/lib/local-db/knowledge")
                                await createKnowledgeRecord(record)
                                if (setKnowledge) {
                  setKnowledge(prev => {
                    if (prev.length === 0) {
                      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent("murici:knowledge-panel-open"))
                    }
                    return [...prev, record]
                  })
                }
              } catch (e) {
                console.error("Failed to save doc", e)
              }
            }
          }
        }
      }
    }

    // Upload each image (stored in newMessageImages) for the user message to message_images bucket
    const uploadPromises = newMessageImages
      .filter(obj => obj.file !== null)
      .map(obj => {
        let filePath = `${profile.user_id}/${currentChat.id}/${
          createdMessages[0].id
        }/${uuidv4()}`

        return uploadMessageImage(filePath, obj.file as File).catch(error => {
          console.error(`Failed to upload image at ${filePath}:`, error)
          return null
        })
      })

    const paths = (await Promise.all(uploadPromises)).filter(
      Boolean
    ) as string[]

    setChatImages(prevImages => [
      ...prevImages,
      ...newMessageImages.map((obj, index) => ({
        ...obj,
        messageId: createdMessages[0].id,
        path: paths[index]
      }))
    ])

    const updatedMessage = await updateMessage(createdMessages[0].id, {
      ...createdMessages[0],
      image_paths: paths
    })

    const createdMessageFileItems = await createMessageFileItems(
      retrievedFileItems.map(fileItem => {
        return {
          user_id: profile.user_id,
          message_id: finalCreatedAssistantMessage.id,
          file_item_id: fileItem.id
        }
      })
    )

    const intermediateMessages = createdMessages.slice(1, -1).map(m => ({
      message: m,
      fileItems: []
    }))

    finalChatMessages = [
      ...chatMessages,
      {
        message: updatedMessage,
        fileItems: []
      },
      ...intermediateMessages,
      {
        message: finalCreatedAssistantMessage,
        fileItems: retrievedFileItems.map(fileItem => fileItem.id)
      }
    ]

    setChatFileItems(prevFileItems => {
      const newFileItems = retrievedFileItems.filter(
        fileItem => !prevFileItems.some(prevItem => prevItem.id === fileItem.id)
      )

      return [...prevFileItems, ...newFileItems]
    })

    setChatMessages(finalChatMessages)

    if (setKnowledge) {
      try {
        const { getAgentBundle } = await import("@/lib/local-db/agent-bundles")
        const activeBundle = await getAgentBundle(currentChat.id)
        const records = buildKnowledgeRecords(
          {
            id: finalCreatedAssistantMessage.id,
            content: generatedText,
            chat_id: currentChat.id
          },
          currentChat.id,
          createdMessages[0].id,
          activeBundle?.aboutme.id
        )
        if (records.length > 0) {
          for (const record of records) {
            await createKnowledgeRecord(record)
          }
          setKnowledge(prev => {
            if (prev.length === 0) {
              window.dispatchEvent(new CustomEvent("murici:knowledge-panel-open"))
            }
            return [...prev, ...records]
          })
          triggerEnrichment(records, backgroundModel ?? modelData, setKnowledge, setBackgroundQueue)
        }
      } catch (err) {
        console.error("[knowledge] extraction/save failed:", err)
      }
    }
  }
}
