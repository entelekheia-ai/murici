"use client"
import { Info } from "lucide-react"
/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import { ChatbotUIContext } from "@/context/context"
import { CHAT_SETTING_LIMITS } from "@/lib/chat-setting-limits"
import { ChatSettings } from "@/types"

import { FC, useContext } from "react"
import { ModelSelect } from "../models/model-select"
import { AdvancedSettings } from "./advanced-settings"
import { Checkbox } from "./checkbox"
import { Label } from "./label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "./select"
import { Slider } from "./slider"
import { TextareaAutosize } from "./textarea-autosize"
import { WithTooltip } from "./with-tooltip"
import { useTranslation } from "react-i18next"

interface ChatSettingsFormProps {
  chatSettings: ChatSettings
  onChangeChatSettings: (value: ChatSettings) => void
  useAdvancedDropdown?: boolean
  showTooltip?: boolean
  onModelSelected?: () => void
}

export const ChatSettingsForm: FC<ChatSettingsFormProps> = ({
  chatSettings,
  onChangeChatSettings,
  useAdvancedDropdown = true,
  showTooltip = true,
  onModelSelected
}) => {
  const { profile } = useContext(ChatbotUIContext)
  const { t } = useTranslation()

  if (!profile) return null

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="text-title-3 text-foreground-primary">
          {t("Model")}
        </div>

        <ModelSelect
          selectedModelId={chatSettings.model}
          onSelectModel={model => {
            onChangeChatSettings({ ...chatSettings, model })
          }}
          onClose={onModelSelected}
        />
      </div>

      {useAdvancedDropdown ? (
        <AdvancedSettings>
          <AdvancedContent
            chatSettings={chatSettings}
            onChangeChatSettings={onChangeChatSettings}
            showTooltip={showTooltip}
          />
        </AdvancedSettings>
      ) : (
        <div>
          <AdvancedContent
            chatSettings={chatSettings}
            onChangeChatSettings={onChangeChatSettings}
            showTooltip={showTooltip}
          />
        </div>
      )}
    </div>
  )
}

interface AdvancedContentProps {
  chatSettings: ChatSettings
  onChangeChatSettings: (value: ChatSettings) => void
  showTooltip: boolean
}

const AdvancedContent: FC<AdvancedContentProps> = ({
  chatSettings,
  onChangeChatSettings,
  showTooltip
}) => {
  const { profile, selectedWorkspace, availableOpenRouterModels, models } =
    useContext(ChatbotUIContext)
  const { t } = useTranslation()

  const isCustomModel = models.some(
    model => model.model_id === chatSettings.model
  )

  function findOpenRouterModel(modelId: string) {
    return availableOpenRouterModels.find(model => model.modelId === modelId)
  }

  const MODEL_LIMITS = CHAT_SETTING_LIMITS[chatSettings.model] || {
    MIN_TEMPERATURE: 0,
    MAX_TEMPERATURE: 1,
    MAX_CONTEXT_LENGTH:
      findOpenRouterModel(chatSettings.model)?.maxContext || 4096
  }

  return (
    <div className="mt-5">
      <div className="space-y-3">
        <Label className="flex items-center space-x-1">
          <div>{t("Temperature")}:</div>

          <div>{chatSettings.temperature}</div>
        </Label>

        <Slider
          value={[chatSettings.temperature]}
          onValueChange={temperature => {
            onChangeChatSettings({
              ...chatSettings,
              temperature: temperature[0]
            })
          }}
          min={MODEL_LIMITS.MIN_TEMPERATURE}
          max={MODEL_LIMITS.MAX_TEMPERATURE}
          step={0.01}
        />
      </div>

      <div className="mt-6 space-y-3">
        <Label className="flex items-center space-x-1">
          <div>{t("Context Length")}:</div>

          <div>{chatSettings.contextLength}</div>
        </Label>

        <Slider
          value={[chatSettings.contextLength]}
          onValueChange={contextLength => {
            onChangeChatSettings({
              ...chatSettings,
              contextLength: contextLength[0]
            })
          }}
          min={0}
          max={
            isCustomModel
              ? models.find(model => model.model_id === chatSettings.model)
                  ?.context_length
              : MODEL_LIMITS.MAX_CONTEXT_LENGTH
          }
          step={1}
        />
      </div>

      <div className="mt-7 flex items-center space-x-2">
        <Checkbox
          checked={chatSettings.includeProfileContext}
          onCheckedChange={(value: boolean) =>
            onChangeChatSettings({
              ...chatSettings,
              includeProfileContext: value
            })
          }
        />

        <Label>{t("Chats Include Profile Context")}</Label>

        {showTooltip && (
          <WithTooltip
            delayDuration={0}
            display={
              <div className="w-[400px] p-3">
                {profile?.profile_context || "No profile context."}
              </div>
            }
            trigger={
              <Info className="cursor-hover:opacity-50" size={16} />
            }
          />
        )}
      </div>

      <div className="mt-4 flex items-center space-x-2">
        <Checkbox
          checked={chatSettings.includeWorkspaceInstructions}
          onCheckedChange={(value: boolean) =>
            onChangeChatSettings({
              ...chatSettings,
              includeWorkspaceInstructions: value
            })
          }
        />

        <Label>{t("Chats Include Workspace Instructions")}</Label>

        {showTooltip && (
          <WithTooltip
            delayDuration={0}
            display={
              <div className="w-[400px] p-3">
                {selectedWorkspace?.instructions ||
                  "No workspace instructions."}
              </div>
            }
            trigger={
              <Info className="cursor-hover:opacity-50" size={16} />
            }
          />
        )}
      </div>

      <div className="mt-5">
        <Label>{t("Embeddings Provider")}</Label>

        <Select
          value={chatSettings.embeddingsProvider}
          onValueChange={(embeddingsProvider: "openai" | "local") => {
            onChangeChatSettings({
              ...chatSettings,
              embeddingsProvider
            })
          }}
        >
          <SelectTrigger>
            <SelectValue defaultValue="openai" />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="openai">
              {profile?.use_azure_openai ? "Azure OpenAI" : "OpenAI"}
            </SelectItem>

            {window.location.hostname === "localhost" && (
              <SelectItem value="local">Local</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
