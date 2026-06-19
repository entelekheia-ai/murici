/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { ChatbotUIContext } from "@/context/context"
import { updateChat } from "@/db/chats"
import { deleteMessagesIncludingAndAfter } from "@/db/messages"
import { getAssistantFilesByAssistantId } from "@/lib/local-db/stubs"
import { buildFinalMessages } from "@/lib/build-prompt"
import { Tables } from "@/types/database"
import {
  ChatMessage,
  ChatPayload,
  FlowEvent,
  LLMID,
  ModelProvider
} from "@/types"
import { useRouter } from "next/navigation"
import { useContext, useEffect, useRef } from "react"
import { v4 as uuidv4 } from "uuid"
import { LLM_LIST } from "../../../lib/models/llm/llm-list"
import {
  createTempMessages,
  handleCreateChat,
  handleCreateMessages,
  handleFlowChat,
  handleHostedChat,
  handleLocalChat,
  handleRetrieval,
  processResponse,
  validateChatSettings
} from "../chat-helpers"

export const useChatHandler = () => {
  const router = useRouter()

  const {
    userInput,
    chatFiles,
    setUserInput,
    setNewMessageImages,
    profile,
    setIsGenerating,
    setChatMessages,
    setFirstTokenReceived,
    selectedChat,
    selectedWorkspace,
    setSelectedChat,
    setChats,
    availableLocalModels,
    availableOpenRouterModels,
    abortController,
    setAbortController,
    chatSettings,
    newMessageImages,
    selectedAssistant,
    chatMessages,
    chatImages,
    setChatImages,
    setChatFiles,
    setNewMessageFiles,
    setShowFilesDisplay,
    newMessageFiles,
    chatFileItems,
    setChatFileItems,
    useRetrieval,
    sourceCount,
    setIsPromptPickerOpen,
    setIsFilePickerOpen,
    setChatSettings,
    models,
    isPromptPickerOpen,
    isFilePickerOpen,
    isToolPickerOpen,
    flowState,
    flowEngine,
    setFlowState,
    setFlowDebugLog,
    setThinkingLog,
    addFlowEvent
  } = useContext(ChatbotUIContext)

  const chatInputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!isPromptPickerOpen || !isFilePickerOpen || !isToolPickerOpen) {
      chatInputRef.current?.focus()
    }
  }, [isPromptPickerOpen, isFilePickerOpen, isToolPickerOpen])

  const handleNewChat = async () => {
    if (!selectedWorkspace) return

    setUserInput("")
    setChatMessages([])
    setSelectedChat(null)
    setChatFileItems([])

    setIsGenerating(false)
    setFirstTokenReceived(false)

    setChatFiles([])
    setChatImages([])
    setNewMessageFiles([])
    setNewMessageImages([])
    setShowFilesDisplay(false)
    setIsPromptPickerOpen(false)
    setIsFilePickerOpen(false)

    if (selectedAssistant) {
      setChatSettings({
        model: selectedAssistant.model as LLMID,
        prompt: selectedAssistant.prompt,
        temperature: selectedAssistant.temperature,
        contextLength: selectedAssistant.context_length,
        includeProfileContext: selectedAssistant.include_profile_context,
        includeWorkspaceInstructions:
          selectedAssistant.include_workspace_instructions,
        embeddingsProvider: selectedAssistant.embeddings_provider as
          | "openai"
          | "local"
      })

      const allFiles = (
        await getAssistantFilesByAssistantId(selectedAssistant.id)
      ).files

      setChatFiles(
        allFiles.map(file => ({
          id: file.id,
          name: file.name,
          type: file.type,
          file: null
        }))
      )

      if (allFiles.length > 0) setShowFilesDisplay(true)
    } else if (selectedWorkspace) {
      // setChatSettings({
      //   model: (selectedWorkspace.default_model ||
      //     "gpt-4-1106-preview") as LLMID,
      //   prompt:
      //     selectedWorkspace.default_prompt ||
      //     "You are a friendly, helpful AI assistant.",
      //   temperature: selectedWorkspace.default_temperature || 0.5,
      //   contextLength: selectedWorkspace.default_context_length || 4096,
      //   includeProfileContext:
      //     selectedWorkspace.include_profile_context || true,
      //   includeWorkspaceInstructions:
      //     selectedWorkspace.include_workspace_instructions || true,
      //   embeddingsProvider:
      //     (selectedWorkspace.embeddings_provider as "openai" | "local") ||
      //     "openai"
      // })
    }

    return router.push(`/${selectedWorkspace.id}/chat`)
  }

  const handleFocusChatInput = () => {
    chatInputRef.current?.focus()
  }

  const handleStopMessage = () => {
    if (abortController) {
      abortController.abort()
    }
  }

  const handleSendMessage = async (
    messageContent: string,
    chatMessages: ChatMessage[],
    isRegeneration: boolean
  ) => {
    const startingInput = messageContent

    try {
      setUserInput("")
      setIsGenerating(true)
      setIsPromptPickerOpen(false)
      setIsFilePickerOpen(false)
      setNewMessageImages([])

      const newAbortController = new AbortController()
      setAbortController(newAbortController)

      const modelData = [
        ...models.map(model => ({
          modelId: model.model_id as LLMID,
          modelName: model.name,
          provider: "custom" as ModelProvider,
          hostedId: model.id,
          platformLink: "",
          imageInput: false
        })),
        ...LLM_LIST,
        ...availableLocalModels,
        ...availableOpenRouterModels
      ].find(llm => llm.modelId === chatSettings?.model)

      validateChatSettings(
        chatSettings,
        modelData,
        profile,
        selectedWorkspace,
        messageContent
      )

      let currentChat = selectedChat ? { ...selectedChat } : null

      const b64Images = newMessageImages.map(image => image.base64)

      let retrievedFileItems: Tables<"file_items">[] = []

      if (
        (newMessageFiles.length > 0 || chatFiles.length > 0) &&
        useRetrieval
      ) {
        retrievedFileItems = await handleRetrieval(
          userInput,
          newMessageFiles,
          chatFiles,
          chatSettings!.embeddingsProvider,
          sourceCount
        )
      }

      const { tempUserChatMessage, tempAssistantChatMessage } =
        createTempMessages(
          messageContent,
          chatMessages,
          chatSettings!,
          b64Images,
          isRegeneration,
          setChatMessages,
          selectedAssistant
        )

      let payload: ChatPayload = {
        chatSettings: chatSettings!,
        workspaceInstructions: selectedWorkspace!.instructions || "",
        chatMessages: isRegeneration
          ? [...chatMessages]
          : [...chatMessages, tempUserChatMessage],
        assistant: selectedChat?.assistant_id ? selectedAssistant : null,
        messageFileItems: retrievedFileItems,
        chatFileItems: chatFileItems,
        flowState: flowState || undefined
      }

      const preTransitionFlowState = flowState
        ? {
            currentState: flowState.currentState,
            goal: flowState.goal ?? null,
            guide: flowState.guide ?? null,
            teach: flowState.teach ?? null,
            validIntents: [...(flowState.validIntents ?? [])]
          }
        : null

      let generatedText = ""
      let sentMessages: any[] = []
      let flowIntentName: string | null = null
      let flowToolExchange: Array<{ role: string; content: any }> | null = null

      const seqNum = isRegeneration
        ? payload.chatMessages[payload.chatMessages.length - 1].message
            .sequence_number
        : tempAssistantChatMessage.message.sequence_number

      // Dispatch flow_context event at turn start
      if (preTransitionFlowState) {
        addFlowEvent({
          id: uuidv4(),
          seqNum,
          type: "flow_context",
          timestamp: Date.now(),
          data: {
            state: preTransitionFlowState.currentState,
            goal: preTransitionFlowState.goal,
            guide: preTransitionFlowState.guide,
            teach: preTransitionFlowState.teach,
            validIntents: preTransitionFlowState.validIntents
          }
        })
      }

      if (
        flowEngine &&
        flowState &&
        flowState.validIntents.length > 0 &&
        modelData!.provider !== "ollama"
      ) {
        // Flow-controlled turn: non-streaming with tool calling
        const result = await handleFlowChat(
          payload,
          profile!,
          modelData!,
          tempAssistantChatMessage,
          isRegeneration,
          chatImages,
          flowState,
          setChatMessages,
          setFirstTokenReceived,
          msgs => {
            sentMessages = msgs
            addFlowEvent({
              id: uuidv4(),
              seqNum,
              type: "llm_request",
              timestamp: Date.now(),
              data: {
                messageCount: msgs.length,
                hasTools: true
              }
            })
          },
          thinking => {
            setThinkingLog(prev => ({ ...prev, [seqNum]: thinking }))
          },
          ev => {
            addFlowEvent({ id: uuidv4(), seqNum, timestamp: Date.now(), ...ev })
          }
        )
        generatedText = result.content
        flowIntentName = result.intentName
        flowToolExchange = result.toolExchange
      } else {
        if (modelData!.provider === "ollama") {
          generatedText = await handleLocalChat(
            payload,
            profile!,
            chatSettings!,
            tempAssistantChatMessage,
            isRegeneration,
            newAbortController,
            setIsGenerating,
            setFirstTokenReceived,
            setChatMessages,
            () => {},
            thinking => {
              setThinkingLog(prev => ({ ...prev, [seqNum]: thinking }))
            }
          )
        } else {
          generatedText = await handleHostedChat(
            payload,
            profile!,
            modelData!,
            tempAssistantChatMessage,
            isRegeneration,
            newAbortController,
            newMessageImages,
            chatImages,
            setIsGenerating,
            setFirstTokenReceived,
            setChatMessages,
            () => {},
            msgs => {
              sentMessages = msgs
            },
            thinking => {
              setThinkingLog(prev => ({ ...prev, [seqNum]: thinking }))
            }
          )
        }
      }

      // Post-turn: run FSM transition (flow only) then record debug info for all turns
      const transitionEffects: any[] = []
      if (flowEngine) {
        if (flowIntentName === "offtopic") {
          const fx = await flowEngine.send_offtopic()
          if (Array.isArray(fx)) {
            transitionEffects.push(...fx)
            const transitionEffect = fx.find(
              (e: any) => e.type === "transition"
            )
            if (transitionEffect) {
              const newState = flowEngine.get_current_state()
              setFlowState({
                currentState: newState,
                goal: fx.find((e: any) => e.type === "goal")?.text,
                guide: fx.find((e: any) => e.type === "guide")?.text,
                teach: fx.find((e: any) => e.type === "teach")?.text,
                validIntents: Array.from(
                  flowEngine.get_valid_intents() || []
                ) as string[]
              })
              addFlowEvent({
                id: uuidv4(),
                seqNum,
                type: "fsm_transition",
                timestamp: Date.now(),
                data: {
                  intent: "offtopic",
                  from: transitionEffect.from,
                  to: transitionEffect.to,
                  effects: fx,
                  newGoal: fx.find((e: any) => e.type === "goal")?.text ?? null,
                  newGuide:
                    fx.find((e: any) => e.type === "guide")?.text ?? null
                }
              })
            }
          }
        } else if (flowIntentName) {
          const fx = await flowEngine.send_intent(flowIntentName)
          if (Array.isArray(fx)) {
            transitionEffects.push(...fx)
            const transitionEffect = fx.find(
              (e: any) => e.type === "transition"
            )
            if (transitionEffect) {
              const newState = flowEngine.get_current_state()
              setFlowState({
                currentState: newState,
                goal: fx.find((e: any) => e.type === "goal")?.text,
                guide: fx.find((e: any) => e.type === "guide")?.text,
                teach: fx.find((e: any) => e.type === "teach")?.text,
                validIntents: Array.from(
                  flowEngine.get_valid_intents() || []
                ) as string[]
              })
              addFlowEvent({
                id: uuidv4(),
                seqNum,
                type: "fsm_transition",
                timestamp: Date.now(),
                data: {
                  intent: flowIntentName,
                  from: transitionEffect.from,
                  to: transitionEffect.to,
                  effects: fx,
                  newGoal: fx.find((e: any) => e.type === "goal")?.text ?? null,
                  newGuide:
                    fx.find((e: any) => e.type === "guide")?.text ?? null
                }
              })
            }
          }
        }
        const tickFx = await flowEngine.tick_prompt()
        if (Array.isArray(tickFx)) transitionEffects.push(...tickFx)
      }

      setFlowDebugLog(prev => ({
        ...prev,
        [seqNum]: {
          sequenceNumber: seqNum,
          stateAtSend: preTransitionFlowState?.currentState ?? "",
          goal: preTransitionFlowState?.goal ?? null,
          guide: preTransitionFlowState?.guide ?? null,
          teach: preTransitionFlowState?.teach ?? null,
          validIntents: preTransitionFlowState?.validIntents ?? [],
          sentMessages,
          rawResponse: generatedText,
          intentFound: flowIntentName,
          transitionEffects,
          toolExchange: flowToolExchange
        }
      }))

      if (!currentChat) {
        currentChat = await handleCreateChat(
          chatSettings!,
          profile!,
          selectedWorkspace!,
          messageContent,
          selectedAssistant!,
          newMessageFiles,
          setSelectedChat,
          setChats,
          setChatFiles
        )
      } else {
        const updatedChat = await updateChat(currentChat.id, {
          updated_at: new Date().toISOString()
        })

        setChats(prevChats => {
          const updatedChats = prevChats.map(prevChat =>
            prevChat.id === updatedChat.id ? updatedChat : prevChat
          )

          return updatedChats
        })
      }

      await handleCreateMessages(
        chatMessages,
        currentChat,
        profile!,
        modelData!,
        messageContent,
        generatedText,
        newMessageImages,
        isRegeneration,
        retrievedFileItems,
        setChatMessages,
        setChatFileItems,
        setChatImages,
        selectedAssistant
      )

      setIsGenerating(false)
      setFirstTokenReceived(false)
    } catch (error) {
      setIsGenerating(false)
      setFirstTokenReceived(false)
      setUserInput(startingInput)
    }
  }

  const handleSendEdit = async (
    editedContent: string,
    sequenceNumber: number
  ) => {
    if (!selectedChat) return

    await deleteMessagesIncludingAndAfter(
      selectedChat.user_id,
      selectedChat.id,
      sequenceNumber
    )

    const filteredMessages = chatMessages.filter(
      chatMessage => chatMessage.message.sequence_number < sequenceNumber
    )

    setChatMessages(filteredMessages)

    handleSendMessage(editedContent, filteredMessages, false)
  }

  return {
    chatInputRef,
    prompt,
    handleNewChat,
    handleSendMessage,
    handleFocusChatInput,
    handleStopMessage,
    handleSendEdit
  }
}
