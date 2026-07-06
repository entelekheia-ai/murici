/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import { ChatbotUIContext } from "@/context/context"
import { updateChat } from "@/db/chats"
import { fetchLocalModels } from "@/lib/models/fetch-models"
import { LLM, LLMID, ModelProvider } from "@/types"
import { cn } from "@/lib/utils"
import { IconChevron } from "@/components/icons/chat-icons"
import { IconSearch } from "@tabler/icons-react"
import { FC, useContext, useEffect, useRef, useState } from "react"
import { ListItem } from "../ui/list-item"
import { useTranslation } from "react-i18next"

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
  const { t } = useTranslation()

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
    <div className="space-y-4">
      <div className="flex h-11 w-full items-center gap-2 rounded-full border border-stroke bg-background-terciary px-4">
        <IconSearch className="text-foreground-secondary shrink-0" size={18} />
        <input
          ref={inputRef}
          className="h-full w-full bg-transparent text-sm placeholder:text-foreground-secondary outline-none border-none focus:ring-0 p-0 text-foreground-primary"
          placeholder={t("Search models...")}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-4">

        {/* ── LOCAL ── */}
        {(availableLocalModels.length > 0 || isDiscovering) && (
          <div>
            <GroupHeader
              label={t("LOCAL")}
              open={accordion.local}
              onToggle={() => toggle("local")}
            />
            {accordion.local && (
              <div className="mt-1">
                {isDiscovering && (
                  <div className="text-muted-foreground px-2 py-1 text-xs">
                    {t("Updating...")}
                  </div>
                )}
                <ul role="listbox" aria-label={t("LOCAL")} className="space-y-[2px]">
                  {availableLocalModels.filter(filter).map(m => (
                    <ListItem
                      key={m.modelId}
                      label={m.modelName}
                      selected={selectedModelId === m.modelId}
                      onClick={() => handleSelectModel(m.modelId)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ── CUSTOM ── */}
        {customModels.length > 0 && (
          <div>
            <GroupHeader
              label={t("CUSTOM")}
              open={accordion.custom}
              onToggle={() => toggle("custom")}
              action={
                <button
                  onClick={e => { e.stopPropagation(); handleManage() }}
                  className="text-muted-foreground hover:text-foreground text-xs font-semibold"
                >
                  {t("Manage →")}
                </button>
              }
            />
            {accordion.custom && (
              <div className="mt-1">
                <ul role="listbox" aria-label={t("CUSTOM")} className="space-y-[2px]">
                  {customModels.filter(filter).map(m => (
                    <ListItem
                      key={m.modelId}
                      label={m.modelName}
                      selected={selectedModelId === m.modelId}
                      onClick={() => handleSelectModel(m.modelId)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ── HOSTED ── */}
        {availableHostedModels.length > 0 && (
          <div>
            <GroupHeader
              label={t("HOSTED")}
              open={accordion.hosted}
              onToggle={() => toggle("hosted")}
            />
            {accordion.hosted && (
              <div className="mt-1">
                {Object.entries(hostedByProvider).map(([provider, pModels]) => {
                  const filtered = pModels.filter(filter)
                  if (!filtered.length) return null
                  const providerLabel = provider === "openai" && profile.use_azure_openai
                    ? "Azure OpenAI"
                    : provider
                  return (
                    <div key={provider} className="mt-2 first:mt-0">
                      <div className="mb-1 ml-3 text-[10px] font-bold text-foreground-secondary uppercase tracking-wider">
                        {providerLabel}
                      </div>
                      <ul role="listbox" aria-label={providerLabel} className="space-y-[2px]">
                        {filtered.map(m => (
                          <ListItem
                            key={m.modelId}
                            label={m.modelName}
                            selected={selectedModelId === m.modelId}
                            onClick={() => handleSelectModel(m.modelId)}
                          />
                        ))}
                      </ul>
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
              label={t("OPENROUTER")}
              open={accordion.openrouter}
              onToggle={() => toggle("openrouter")}
            />
            {accordion.openrouter && (
              <div className="mt-1">
                <ul role="listbox" aria-label={t("OPENROUTER")} className="space-y-[2px]">
                  {availableOpenRouterModels.filter(filter).map(m => (
                    <ListItem
                      key={m.modelId}
                      label={m.modelName}
                      selected={selectedModelId === m.modelId}
                      onClick={() => handleSelectModel(m.modelId)}
                    />
                  ))}
                </ul>
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
      className="flex flex-1 items-center gap-1.5 hover:opacity-75 focus-visible:opacity-75 outline-none"
    >
      <IconChevron
        size={12}
        className={cn(
          "text-foreground-secondary transition-transform duration-200",
          open ? "rotate-0" : "-rotate-90"
        )}
      />
      <span className="text-[11px] font-bold uppercase tracking-wider text-foreground-secondary">
        {label}
      </span>
    </button>
    {action}
  </div>
)
