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
import React from "react"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"

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

  const response = await fetchChatResponse(
    `${baseUrl}/v1/chat/completions`,
    {
      model: chatSettings.model,
      messages: formattedMessages,
      temperature: payload.chatSettings.temperature,
      stream: true
    },
    false,
    newAbortController,
    setIsGenerating,
    setChatMessages,
    headers
  )

  return await processResponse(
    response,
    isRegeneration
      ? payload.chatMessages[payload.chatMessages.length - 1]
      : tempAssistantMessage,
    false,
    newAbortController,
    setFirstTokenReceived,
    setChatMessages,
    setToolInUse,
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
  const tools = [
    buildTriggerIntentTool(flowState.validIntents)
  ]

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

  const res = await fetch(apiEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chatSettings: payload.chatSettings,
      messages,
      tools,
      customModel,
      apiKeys: buildApiKeys(profile)
    })
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Request failed" }))
    throw new Error(err.message || "Flow chat request failed")
  }

  const data = await res.json()

  let content = ""
  let thinking: string | null = null
  let intentName: string | null = null
  let toolExchange: Array<{ role: string; content: any }> | null = null

  const targetId = isRegeneration
    ? payload.chatMessages[payload.chatMessages.length - 1].message.id
    : tempAssistantChatMessage.message.id

  const showIndicatorAndStream = async (
    exchangeMessages: Array<{ role: string; content: any }>,
    indicatorText: string
  ) => {
    toolExchange = exchangeMessages
    content = indicatorText
    setFirstTokenReceived(true)
    setChatMessages(prev =>
      prev.map(m =>
        m.message.id === targetId
          ? { ...m, message: { ...m.message, content } }
          : m
      )
    )
    onEvent?.({ type: "second_turn", data: {} })
    // Second turn: stream conversational response with think-block extraction
    const res2 = await fetch(apiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatSettings: payload.chatSettings,
        messages: [...messages, ...exchangeMessages.map(m => ({ ...m }))],
        customModel,
        apiKeys: buildApiKeys(profile)
      })
    })
    if (res2.ok && res2.body) {
      let rawAccum = ""
      await consumeReadableStream(
        res2.body,
        chunk => {
          rawAccum += chunk
          const { displayText, thinkingText } = extractThinkBlocks(rawAccum)
          content = indicatorText + displayText
          if (thinkingText) {
            thinking = thinkingText
            onThinkingUpdate?.(thinkingText)
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
    }
  }

  if (provider === "anthropic") {
    const textBlock = data.content?.find((b: any) => b.type === "text")
    const toolBlock = data.content?.find(
      (b: any) => b.type === "tool_use" && b.name === "trigger_intent"
    )
    content = textBlock?.text ?? ""
    intentName = toolBlock?.input?.intent_name ?? null

    if (toolBlock && !content) {
      onEvent?.({ type: "tool_call", data: { intentName, raw: toolBlock } })
      const assistantMsg = { role: "assistant", content: data.content }
      const toolResultMsg = {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: toolBlock.id, content: "ok" }
        ]
      }
      await showIndicatorAndStream([assistantMsg, toolResultMsg], "")
    }
  } else {
    // OpenAI-compatible (openai, custom, azure)
    const msg = data.choices?.[0]?.message
    content = msg?.content ?? ""
    const call = msg?.tool_calls?.find(
      (c: any) => c.function?.name === "trigger_intent"
    )
    if (call) {
      try {
        intentName = JSON.parse(call.function.arguments)?.intent_name ?? null
      } catch {}

      if (!content) {
        onEvent?.({ type: "tool_call", data: { intentName, raw: call } })
        const assistantMsg = {
          role: "assistant",
          content: msg.content ?? null,
          tool_calls: msg.tool_calls
        }
        const toolMsg = { role: "tool", tool_call_id: call.id, content: "ok" }
        await showIndicatorAndStream([assistantMsg, toolMsg], "")
      }
    }
  }

  // Extract think blocks from direct (non-streaming) content paths
  if (content && !thinking) {
    const { displayText, thinkingText } = extractThinkBlocks(content)
    if (thinkingText) {
      content = displayText
      thinking = thinkingText
      onThinkingUpdate?.(thinkingText)
    }
  }

  // Final update covers the case where content came from the first call directly
  setFirstTokenReceived(true)
  setChatMessages(prev =>
    prev.map(m =>
      m.message.id === targetId
        ? { ...m, message: { ...m.message, content } }
        : m
    )
  )

  return { content, thinking, intentName, toolExchange }
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

  const requestBody = {
    chatSettings: payload.chatSettings,
    messages: formattedMessages,
    customModel,
    apiKeys: buildApiKeys(profile)
  }

  const response = await fetchChatResponse(
    apiEndpoint,
    requestBody,
    true,
    newAbortController,
    setIsGenerating,
    setChatMessages
  )

  return await processResponse(
    response,
    isRegeneration
      ? payload.chatMessages[payload.chatMessages.length - 1]
      : tempAssistantChatMessage,
    true,
    newAbortController,
    setFirstTokenReceived,
    setChatMessages,
    setToolInUse,
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

function extractThinkBlocks(raw: string): {
  displayText: string
  thinkingText: string
} {
  const startTag = "<think>"
  const endTag = "</think>"
  const startIdx = raw.indexOf(startTag)

  if (startIdx === -1) {
    return { displayText: raw, thinkingText: "" }
  }

  const endIdx = raw.indexOf(endTag, startIdx)
  const preThink = raw.slice(0, startIdx)

  if (endIdx === -1) {
    // Think block still open: hide it from display, accumulate as thinking
    return {
      displayText: preThink,
      thinkingText: raw.slice(startIdx + startTag.length)
    }
  }

  // Think block closed: extract thinking, stitch display text
  const thinkingText = raw.slice(startIdx + startTag.length, endIdx)
  const postThink = raw.slice(endIdx + endTag.length).trimStart()
  return {
    displayText: preThink ? preThink + postThink : postThink,
    thinkingText
  }
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

        const { displayText, thinkingText } = extractThinkBlocks(rawAccum)
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
  backgroundModel?: LLM | null
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
    const createdMessages = await createMessages([
      finalUserMessage,
      finalAssistantMessage
    ])

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
          message_id: createdMessages[1].id,
          file_item_id: fileItem.id
        }
      })
    )

    finalChatMessages = [
      ...chatMessages,
      {
        message: updatedMessage,
        fileItems: []
      },
      {
        message: createdMessages[1],
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
        const records = buildKnowledgeRecords(
          {
            id: createdMessages[1].id,
            content: generatedText,
            chat_id: currentChat.id
          },
          currentChat.id,
          createdMessages[0].id
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
          triggerEnrichment(records, backgroundModel ?? modelData, setKnowledge)
        }
      } catch (err) {
        console.error("[knowledge] extraction/save failed:", err)
      }
    }
  }
}
