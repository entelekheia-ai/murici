import { Search } from "lucide-react"
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

import { FC, useContext, useEffect, useRef, useState } from "react"
import { ListItem } from "../ui/list-item"
import { useTranslation } from "react-i18next"

const ACCORDION_KEY = "murici_accordion"
const SELECTED_MODEL_KEY = "murici_selected_model"
const TIER_ACCORDION_KEY = "murici_accordion_tiers"

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

// Sub-grouping within HOSTED, by provider — only rendered when a provider's
// models actually span more than one tier (otherwise it's just a flat list,
// same as before this existed). Kept in its own localStorage key/shape
// (keyed by "<provider>:<tier>") instead of extending AccordionState, since
// the set of providers is dynamic and unrelated to the four fixed top groups.
type ModelTier = NonNullable<LLM["tier"]>

const TIER_ORDER: ModelTier[] = ["current", "experimental", "legacy"]

const TIER_LABELS: Record<ModelTier, string> = {
  current: "Current",
  experimental: "Experimental",
  legacy: "Legacy"
}

const DEFAULT_TIER_OPEN: Record<ModelTier, boolean> = {
  current: true,
  experimental: false,
  legacy: false
}

function readTierAccordion(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(TIER_ACCORDION_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeTierAccordion(state: Record<string, boolean>) {
  localStorage.setItem(TIER_ACCORDION_KEY, JSON.stringify(state))
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
  const [tierAccordion, setTierAccordion] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setAccordion(readAccordion())
    setTierAccordion(readTierAccordion())
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

  const isTierOpen = (provider: string, tier: ModelTier) => {
    const tierKey = `${provider}:${tier}`
    return tierKey in tierAccordion ? tierAccordion[tierKey] : DEFAULT_TIER_OPEN[tier]
  }

  const toggleTier = (provider: string, tier: ModelTier) => {
    const tierKey = `${provider}:${tier}`
    const next = { ...tierAccordion, [tierKey]: !isTierOpen(provider, tier) }
    setTierAccordion(next)
    writeTierAccordion(next)
  }

  // A provider's real (non-sentinel) models, restricted to whichever tiers
  // are open — used for Enter-to-select, mirroring the top-level
  // accordion.hosted gate. When a provider's models don't actually span more
  // than one tier there's no sub-accordion rendered, so nothing is hidden.
  const visibleHostedModels = (provider: string, pModels: LLM[]): LLM[] => {
    const real = pModels.filter(m => !m.disabled)
    const tiersPresent = new Set(real.map(m => m.tier ?? "current"))
    if (tiersPresent.size <= 1) return pModels
    return pModels.filter(m => m.disabled || isTierOpen(provider, m.tier ?? "current"))
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
  // Disabled entries (discovery-error placeholders) still render so the user
  // sees why a provider's group looks empty, but Enter must never "select" one.
  const selectableFilter = (m: LLM) => filter(m) && !m.disabled

  // Same order the sections render in below, respecting which accordions
  // are open — a match hidden inside a collapsed section shouldn't be
  // selectable via Enter.
  const firstVisibleMatch: LLM | undefined = [
    ...(accordion.local ? availableLocalModels.filter(selectableFilter) : []),
    ...(accordion.custom ? customModels.filter(selectableFilter) : []),
    ...(accordion.hosted
      ? Object.entries(hostedByProvider).flatMap(([provider, pModels]) =>
          visibleHostedModels(provider, pModels).filter(selectableFilter)
        )
      : []),
    ...(accordion.openrouter ? availableOpenRouterModels.filter(selectableFilter) : [])
  ][0]

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // The search input had no key handling at all — Enter and Escape both
    // fell through and did nothing, which reads as the picker being broken.
    if (event.key === "Enter" && firstVisibleMatch) {
      event.preventDefault()
      handleSelectModel(firstVisibleMatch.modelId)
    } else if (event.key === "Escape") {
      event.preventDefault()
      onClose?.()
    }
  }

  if (!profile) return null

  return (
    <div className="space-y-4">
      <div className="flex h-11 w-full items-center gap-2 rounded-full border border-stroke bg-background-terciary px-4">
        <Search className="shrink-0 text-foreground-secondary" size={18} />
        <input
          ref={inputRef}
          className="size-full border-none bg-transparent p-0 text-sm text-foreground-primary outline-none placeholder:text-foreground-secondary focus:ring-0"
          placeholder={t("Search models...")}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
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
                  <div className="px-2 py-1 text-xs text-muted-foreground">
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
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground"
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

                  const disabledEntries = filtered.filter(m => m.disabled)
                  const realModels = filtered.filter(m => !m.disabled)
                  const tiersPresent = TIER_ORDER.filter(tier =>
                    realModels.some(m => (m.tier ?? "current") === tier)
                  )
                  const useSubAccordion = tiersPresent.length > 1

                  const renderRow = (m: LLM) =>
                    m.disabled ? (
                      <li
                        key={m.modelId}
                        aria-disabled="true"
                        className="text-small-regular flex h-[37px] w-full cursor-not-allowed select-none items-center justify-start rounded-[8px] px-3 py-2.5 text-foreground-secondary"
                      >
                        {t("Could not load models")}
                      </li>
                    ) : (
                      <ListItem
                        key={m.modelId}
                        label={m.modelName}
                        selected={selectedModelId === m.modelId}
                        onClick={() => handleSelectModel(m.modelId)}
                      />
                    )

                  return (
                    <div key={provider} className="mt-2 first:mt-0">
                      <div className="mb-1 ml-3 text-[10px] font-bold uppercase tracking-wider text-foreground-secondary">
                        {providerLabel}
                      </div>
                      {disabledEntries.length > 0 && (
                        <ul role="listbox" aria-label={providerLabel} className="space-y-[2px]">
                          {disabledEntries.map(renderRow)}
                        </ul>
                      )}
                      {!useSubAccordion ? (
                        <ul role="listbox" aria-label={providerLabel} className="space-y-[2px]">
                          {realModels.map(renderRow)}
                        </ul>
                      ) : (
                        tiersPresent.map(tier => {
                          const tierModels = realModels.filter(
                            m => (m.tier ?? "current") === tier
                          )
                          const open = isTierOpen(provider, tier)
                          return (
                            <div key={tier} className="mt-1 pl-2">
                              <GroupHeader
                                label={t(TIER_LABELS[tier])}
                                open={open}
                                onToggle={() => toggleTier(provider, tier)}
                              />
                              {open && (
                                <ul
                                  role="listbox"
                                  aria-label={`${providerLabel} ${TIER_LABELS[tier]}`}
                                  className="space-y-[2px]"
                                >
                                  {tierModels.map(renderRow)}
                                </ul>
                              )}
                            </div>
                          )
                        })
                      )}
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
  <div className="flex w-full items-center justify-between p-1">
    <button
      onClick={onToggle}
      className="flex flex-1 items-center gap-1.5 outline-none hover:opacity-75 focus-visible:opacity-75"
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
