import { SlidersHorizontal } from "lucide-react"
/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import { ChatbotUIContext } from "@/context/context"
import { CHAT_SETTING_LIMITS } from "@/lib/chat-setting-limits"
import useHotkey from "@/lib/hooks/use-hotkey"
import { LLMID, ModelProvider } from "@/types"

import { FC, useContext, useEffect, useRef, useState } from "react"
import { ChatSettingsForm } from "../ui/chat-settings-form"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { PillButton } from "../ui/button-pill"
import { IconChevron } from "../icons/chat-icons"
import { useTranslation } from "react-i18next"

interface ChatSettingsProps {}

export const ChatSettings: FC<ChatSettingsProps> = ({}) => {
  useHotkey("i", () => handleClick())
  const { t } = useTranslation()

  const {
    chatSettings,
    setChatSettings,
    models,
    availableHostedModels,
    availableLocalModels,
    availableOpenRouterModels
  } = useContext(ChatbotUIContext)

  const buttonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  const handleClick = () => {
    setOpen(prev => !prev)
  }

  useEffect(() => {
    const handleOpen = () => setOpen(true)
    window.addEventListener("murici:model-selector-open", handleOpen)
    return () => {
      window.removeEventListener("murici:model-selector-open", handleOpen)
    }
  }, [])

  useEffect(() => {
    setChatSettings(prev => {
      if (!prev) return prev
      return {
        ...prev,
        temperature: Math.min(
          prev.temperature,
          CHAT_SETTING_LIMITS[prev.model]?.MAX_TEMPERATURE || 1
        ),
        contextLength: Math.min(
          prev.contextLength,
          CHAT_SETTING_LIMITS[prev.model]?.MAX_CONTEXT_LENGTH || 4096
        )
      }
    })
  }, [chatSettings?.model])

  if (!chatSettings) return null

  const allModels = [
    ...models.map(model => ({
      modelId: model.model_id as LLMID,
      modelName: model.name,
      provider: "custom" as ModelProvider,
      hostedId: model.id,
      platformLink: "",
      imageInput: false
    })),
    ...availableHostedModels,
    ...availableLocalModels,
    ...availableOpenRouterModels
  ]

  const fullModel = allModels.find(llm => llm.modelId === chatSettings.model)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PillButton
          ref={buttonRef}
          data-dot-id="model-selector"
          label={fullModel?.modelName || chatSettings.model}
          showIcon={true}
          icon={
            <IconChevron
              direction={open ? "down" : "up"}
              size={12}
              className="shrink-0 text-foreground-primary"
            />
          }
          className="max-w-[240px] border border-stroke bg-background-light text-foreground-primary hover:bg-black/5 dark:hover:bg-white/5"
          onClick={() => setOpen(prev => !prev)}
        />
      </PopoverTrigger>

      <PopoverContent
        className="relative flex max-h-[calc(100vh-60px)] w-fit min-w-[120px] max-w-[480px] flex-col space-y-4 overflow-auto rounded-[8px] border-none bg-background-light p-5 shadow-lg"
        align="center"
      >
        <ChatSettingsForm
          chatSettings={chatSettings}
          onChangeChatSettings={setChatSettings}
          onModelSelected={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}
