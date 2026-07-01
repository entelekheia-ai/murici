/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import { ChatbotUIContext } from "@/context/context"
import { CHAT_SETTING_LIMITS } from "@/lib/chat-setting-limits"
import useHotkey from "@/lib/hooks/use-hotkey"
import { LLMID, ModelProvider } from "@/types"
import { IconAdjustmentsHorizontal } from "@tabler/icons-react"
import { FC, useContext, useEffect, useRef, useState } from "react"
import { Button } from "../ui/button"
import { ChatSettingsForm } from "../ui/chat-settings-form"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { IconSparklesFigma, IconChevronDownFigma } from "../icons/chat-icons"

interface ChatSettingsProps {}

export const ChatSettings: FC<ChatSettingsProps> = ({}) => {
  useHotkey("i", () => handleClick())

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
        <Button
          ref={buttonRef}
          className="flex h-[29px] items-center space-x-1.5 rounded-full border border-[#E5E3DF] bg-transparent px-3 py-1 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          onClick={() => setOpen(prev => !prev)}
        >
          <IconSparklesFigma className="text-muted-foreground" size={16} />
          
          <div className="max-w-[120px] truncate text-sm font-medium sm:max-w-[300px] lg:max-w-[500px] text-murici-text-primary">
            {fullModel?.modelName || chatSettings.model}
          </div>

          <IconChevronDownFigma className="text-muted-foreground" size={12} />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="bg-background border-input relative flex max-h-[calc(100vh-60px)] w-[300px] flex-col space-y-4 overflow-auto rounded-lg border-2 p-6 sm:w-[350px] md:w-[400px] lg:w-[500px] dark:border-none"
        align="end"
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
