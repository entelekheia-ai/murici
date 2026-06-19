/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import { ChatbotUIContext } from "@/context/context"
import { updateChat } from "@/db/chats"
import { fetchLocalModels } from "@/lib/models/fetch-models"
import { LLM, LLMID, ModelProvider } from "@/types"
import { cn } from "@/lib/utils"
import { IconCheck, IconChevronRight } from "@tabler/icons-react"
import { FC, useContext, useEffect, useRef, useState } from "react"
import { Input } from "../ui/input"
import { ModelIcon } from "./model-icon"
import { ModelOption } from "./model-option"

const ACCORDION_KEY = "murici_accordion"
const SELECTED_MODEL_KEY = "murici_selected_model"

interface AccordionState {
  local: boolean
  custom: boolean
  hosted: boolean
  openrouter: boolean
}

const DEFAULT_ACCORDION: AccordionState = {
  local: true,
  custom: true,
  hosted: true,
  openrouter: false
}

function readAccordion(): AccordionState {
  try {
    const raw = localStorage.getItem(ACCORDION_KEY)
    return raw ? { ...DEFAULT_ACCORDION, ...JSON.parse(raw) } : DEFAULT_ACCORDION
  } catch {
    return DEFAULT_ACCORDION
  }
}

function writeAccordion(state: AccordionState) {
  localStorage.setItem(ACCORDION_KEY, JSON.stringify(state))
}

interface ModelSelectProps {
  selectedModelId: string
  onSelectModel: (modelId: LLMID | string) => void
  onClose?: () => void
}

export const ModelSelect: FC<ModelSelectProps> = ({
  selectedModelId,
  onSelectModel,
  onClose
}) => {
  const {
    profile,
    models,
    availableHostedModels,
    availableLocalModels,
    setAvailableLocalModels,
    availableOpenRouterModels,
    selectedChat,
    setChats
  } = useContext(ChatbotUIContext)

  const inputRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState("")
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [accordion, setAccordion] = useState<AccordionState>(DEFAULT_ACCORDION)

  useEffect(() => {
    setAccordion(readAccordion())
    // Run discovery on mount
    setIsDiscovering(true)
    fetchLocalModels().then(discovered => {
      setAvailableLocalModels(discovered)
      setIsDiscovering(false)
    })
  }, [])

  const toggle = (key: keyof AccordionState) => {
    const next = { ...accordion, [key]: !accordion[key] }
    setAccordion(next)
    writeAccordion(next)
  }

  const handleSelectModel = async (modelId: LLMID | string) => {
    onSelectModel(modelId)
    localStorage.setItem(SELECTED_MODEL_KEY, modelId as string)
    if (selectedChat) {
      const updated = await updateChat(selectedChat.id, {
        model: modelId as string
      })
      setChats(prev => prev.map(c => (c.id === updated.id ? updated : c)))
    }
    onClose?.()
  }

  const handleManage = () => {
    window.dispatchEvent(
      new CustomEvent("murici:sidebar-navigate", { detail: "models" })
    )
  }

  // Custom models from DB
  const customModels: LLM[] = models.map(m => ({
    modelId: m.model_id as LLMID,
    modelName: m.name,
    provider: "custom" as ModelProvider,
    hostedId: m.id,
    platformLink: "",
    imageInput: false
  }))

  // Hosted: group by provider
  const hostedByProvider = availableHostedModels.reduce<Record<string, LLM[]>>(
    (acc, m) => {
      if (!acc[m.provider]) acc[m.provider] = []
      acc[m.provider].push(m)
      return acc
    },
    {}
  )

  const filter = (m: LLM) =>
    m.modelName.toLowerCase().includes(search.toLowerCase())

  if (!profile) return null

  return (
    <div className="space-y-2">
      <Input
        ref={inputRef}
        className="w-full"
        placeholder="Search models..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div className="space-y-1">

        {/* ── LOCAL ── */}
        {(availableLocalModels.length > 0 || isDiscovering) && (
          <div>
            <GroupHeader
              label="LOCAL"
              open={accordion.local}
              onToggle={() => toggle("local")}
            />
            {accordion.local && (
              <div className="mb-1">
                {isDiscovering && (
                  <div className="text-muted-foreground px-2 py-1 text-xs">
                    Atualizando...
                  </div>
                )}
                {availableLocalModels.filter(filter).map(m => (
                  <ModelRow
                    key={m.modelId}
                    model={m}
                    selected={selectedModelId === m.modelId}
                    onSelect={() => handleSelectModel(m.modelId)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CUSTOM ── */}
        {customModels.length > 0 && (
          <div>
            <GroupHeader
              label="CUSTOM"
              open={accordion.custom}
              onToggle={() => toggle("custom")}
              action={
                <button
                  onClick={e => { e.stopPropagation(); handleManage() }}
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  Gerenciar →
                </button>
              }
            />
            {accordion.custom && (
              <div className="mb-1">
                {customModels.filter(filter).map(m => (
                  <ModelRow
                    key={m.modelId}
                    model={m}
                    selected={selectedModelId === m.modelId}
                    onSelect={() => handleSelectModel(m.modelId)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── HOSTED ── */}
        {availableHostedModels.length > 0 && (
          <div>
            <GroupHeader
              label="HOSTED"
              open={accordion.hosted}
              onToggle={() => toggle("hosted")}
            />
            {accordion.hosted && (
              <div className="mb-1">
                {Object.entries(hostedByProvider).map(([provider, pModels]) => {
                  const filtered = pModels.filter(filter)
                  if (!filtered.length) return null
                  return (
                    <div key={provider}>
                      <div className="mb-1 ml-4 text-xs font-semibold opacity-40 uppercase tracking-wide">
                        {provider === "openai" && profile.use_azure_openai
                          ? "Azure OpenAI"
                          : provider}
                      </div>
                      {filtered.map(m => (
                        <ModelRow
                          key={m.modelId}
                          model={m}
                          selected={selectedModelId === m.modelId}
                          onSelect={() => handleSelectModel(m.modelId)}
                        />
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── OPENROUTER ── */}
        {availableOpenRouterModels.length > 0 && (
          <div>
            <GroupHeader
              label="OPENROUTER"
              open={accordion.openrouter}
              onToggle={() => toggle("openrouter")}
            />
            {accordion.openrouter && (
              <div className="mb-1">
                {availableOpenRouterModels.filter(filter).map(m => (
                  <ModelRow
                    key={m.modelId}
                    model={m}
                    selected={selectedModelId === m.modelId}
                    onSelect={() => handleSelectModel(m.modelId)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

// ── Subcomponents ──────────────────────────────────────────

interface GroupHeaderProps {
  label: string
  open: boolean
  onToggle: () => void
  action?: React.ReactNode
}

const GroupHeader: FC<GroupHeaderProps> = ({ label, open, onToggle, action }) => (
  <div className="flex w-full items-center justify-between px-1 py-1">
    <button
      onClick={onToggle}
      className="flex flex-1 items-center gap-1 hover:opacity-70"
    >
      <IconChevronRight
        size={12}
        className={cn("transition-transform opacity-50", open && "rotate-90")}
      />
      <span className="text-xs font-bold tracking-wide opacity-50">{label}</span>
    </button>
    {action}
  </div>
)

interface ModelRowProps {
  model: LLM
  selected: boolean
  onSelect: () => void
}

const ModelRow: FC<ModelRowProps> = ({ model, selected, onSelect }) => (
  <div className="flex items-center space-x-1">
    {selected && <IconCheck className="ml-2 shrink-0" size={16} />}
    <ModelOption model={model} onSelect={onSelect} />
  </div>
)
