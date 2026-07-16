import { FileDown, User } from "lucide-react"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { ChatbotUIContext } from "@/context/context"
import { PROFILE_CONTEXT_MAX, PROFILE_DISPLAY_NAME_MAX } from "@/db/limits"
import { updateProfile } from "@/db/profile"
import { uploadProfileImage } from "@/db/storage/profile-images"
import { exportLocalStorageAsJSON } from "@/lib/export-old-data"
import {
  fetchHostedModels,
  fetchOpenRouterModels
} from "@/lib/models/fetch-models"
import { cn } from "@/lib/utils"
import { setLocalePreference } from "@/lib/locale-actions"
import { LOCALE_DISPLAY_NAMES, SUPPORTED_LOCALES } from "@/lib/locale-names"
import { OpenRouterLLM } from "@/types"

import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { FC, useContext, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { useCurrentLocale } from "next-i18n-router/client"
import i18nConfig from "@/i18nConfig"
import { SIDEBAR_ICON_SIZE } from "../sidebar/sidebar-switcher"
import { Button } from "../ui/button"
import ImagePicker from "../ui/image-picker"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { LimitDisplay } from "../ui/limit-display"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "../ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
import { TextareaAutosize } from "../ui/textarea-autosize"
import { WithTooltip } from "../ui/with-tooltip"
import { MCPSettings } from "./mcp-settings"

const LOCALE_PROMPTS: Record<string, string> = {
  en: "You are a helpful AI assistant.",
  "pt-BR": "Você é um assistente de IA útil.",
  pt: "Você é um assistente de IA útil.",
  es: "Eres un asistente de IA útil.",
  fr: "Tu es un assistant IA utile.",
  de: "Du bist ein hilfreicher KI-Assistent.",
  it: "Sei un assistente IA utile.",
  ja: "あなたは役立つAIアシスタントです。",
  ko: "당신은 도움이 되는 AI 어시스턴트입니다.",
  zh: "你是一个有用的AI助手。",
  ru: "Вы полезный ИИ-помощник.",
  ar: "أنت مساعد ذكاء اصطناعي مفيد.",
  sv: "Du är en hjälpsam AI-assistent.",
  id: "Anda adalah asisten AI yang membantu.",
  vi: "Bạn là trợ lý AI hữu ích.",
  he: "אתה עוזר AI מועיל."
}

function defaultLocalePrompt(): string {
  if (typeof navigator === "undefined") return LOCALE_PROMPTS.en
  const lang = navigator.language
  return (
    LOCALE_PROMPTS[lang] ??
    LOCALE_PROMPTS[lang.split("-")[0]] ??
    LOCALE_PROMPTS.en
  )
}

interface ProfileSettingsProps {}

export const ProfileSettings: FC<ProfileSettingsProps> = ({}) => {
  const { t } = useTranslation()
  const {
    profile,
    setProfile,
    envKeyMap,
    setAvailableHostedModels,
    setAvailableOpenRouterModels,
    availableOpenRouterModels,
    availableLocalModels,
    backgroundModelMissing,
    setBackgroundModelMissing,
    setBackgroundModel,
    chatSettings,
    setChatSettings
  } = useContext(ChatbotUIContext)

  const router = useRouter()
  const pathname = usePathname()
  const currentLocale = useCurrentLocale(i18nConfig) ?? i18nConfig.defaultLocale

  const buttonRef = useRef<HTMLButtonElement>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("profile")

  useEffect(() => {
    const openOnTab = (tab: string) => () => {
      setActiveTab(tab)
      setIsOpen(true)
    }
    // Plain UI-to-UI signal (sidebar "Configurações" button, Electron menu
    // "open-settings", the background-model-missing banner) — NOT an agent
    // runtime action, since nothing here is driven by a `.behavior` effect.
    // Opens on the default tab.
    const openGeneric = openOnTab("profile")
    // The two agent runtime actions (project/plans/017,
    // docs/architecture/runtime-actions.md) that open this panel, each on its
    // own tab — they used to share "murici:profile-open" with a detail.tab
    // payload; the namespaced vocabulary gives each its own event instead.
    const openMcp = openOnTab("mcp")
    const openAiHelper = openOnTab("profile") // auto-task model lives in the Profile tab
    window.addEventListener("murici:profile-open", openGeneric)
    window.addEventListener("settings:mcp-open", openMcp)
    window.addEventListener("settings:ai-helper-open", openAiHelper)
    return () => {
      window.removeEventListener("murici:profile-open", openGeneric)
      window.removeEventListener("settings:mcp-open", openMcp)
      window.removeEventListener("settings:ai-helper-open", openAiHelper)
    }
  }, [])

  const [displayName, setDisplayName] = useState(profile?.display_name || "")
  const [profileImageSrc, setProfileImageSrc] = useState(
    profile?.image_url || ""
  )
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null)
  const [profileInstructions, setProfileInstructions] = useState(
    profile?.profile_context || ""
  )

  const [systemPrompt, setSystemPrompt] = useState(() => {
    if (chatSettings?.prompt) return chatSettings.prompt
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("murici_system_prompt")
      if (saved) return saved
    }
    return defaultLocalePrompt()
  })

  const [useAzureOpenai, setUseAzureOpenai] = useState(
    profile?.use_azure_openai
  )
  const [openaiAPIKey, setOpenaiAPIKey] = useState(
    profile?.openai_api_key || ""
  )
  const [openaiOrgID, setOpenaiOrgID] = useState(
    profile?.openai_organization_id || ""
  )
  const [azureOpenaiAPIKey, setAzureOpenaiAPIKey] = useState(
    profile?.azure_openai_api_key || ""
  )
  const [azureOpenaiEndpoint, setAzureOpenaiEndpoint] = useState(
    profile?.azure_openai_endpoint || ""
  )
  const [azureOpenai35TurboID, setAzureOpenai35TurboID] = useState(
    profile?.azure_openai_35_turbo_id || ""
  )
  const [azureOpenai45TurboID, setAzureOpenai45TurboID] = useState(
    profile?.azure_openai_45_turbo_id || ""
  )
  const [azureOpenai45VisionID, setAzureOpenai45VisionID] = useState(
    profile?.azure_openai_45_vision_id || ""
  )
  const [azureEmbeddingsID, setAzureEmbeddingsID] = useState(
    profile?.azure_openai_embeddings_id || ""
  )
  const [anthropicAPIKey, setAnthropicAPIKey] = useState(
    profile?.anthropic_api_key || ""
  )
  const [googleGeminiAPIKey, setGoogleGeminiAPIKey] = useState(
    profile?.google_gemini_api_key || ""
  )
  const [mistralAPIKey, setMistralAPIKey] = useState(
    profile?.mistral_api_key || ""
  )
  const [groqAPIKey, setGroqAPIKey] = useState(profile?.groq_api_key || "")
  const [perplexityAPIKey, setPerplexityAPIKey] = useState(
    profile?.perplexity_api_key || ""
  )

  const [openrouterAPIKey, setOpenrouterAPIKey] = useState(
    profile?.openrouter_api_key || ""
  )

  const [backgroundModelId, setBackgroundModelId] = useState(
    profile?.background_model_id ?? ""
  )

  const handleSave = async () => {
    if (!profile) return
    let profileImageUrl = profile.image_url
    let profileImagePath = ""

    if (profileImageFile) {
      const { path, url } = await uploadProfileImage(profile, profileImageFile)
      profileImageUrl = url ?? profileImageUrl
      profileImagePath = path
    }

    const updatedProfile = await updateProfile(profile.id, {
      ...profile,
      display_name: displayName,
      username: profile.username,
      profile_context: profileInstructions,
      image_url: profileImageUrl,
      image_path: profileImagePath,
      // "|| null" on every key/id field below: local state for each of these
      // defaults to useState(profile?.x || "") (empty string when unset), and
      // saving that "" straight through would overwrite a previously-null
      // field with "" — which then silently defeats the env-var fallback in
      // getProfileFromBody/buildApiKeys for any provider the user hasn't
      // typed a key into (an empty string isn't null/undefined, so "??"
      // fallback chains never trigger). null is the correct "unset" value.
      openai_api_key: openaiAPIKey || null,
      openai_organization_id: openaiOrgID || null,
      anthropic_api_key: anthropicAPIKey || null,
      google_gemini_api_key: googleGeminiAPIKey || null,
      mistral_api_key: mistralAPIKey || null,
      groq_api_key: groqAPIKey || null,
      perplexity_api_key: perplexityAPIKey || null,
      use_azure_openai: useAzureOpenai,
      azure_openai_api_key: azureOpenaiAPIKey || null,
      azure_openai_endpoint: azureOpenaiEndpoint || null,
      azure_openai_35_turbo_id: azureOpenai35TurboID || null,
      azure_openai_45_turbo_id: azureOpenai45TurboID || null,
      azure_openai_45_vision_id: azureOpenai45VisionID || null,
      azure_openai_embeddings_id: azureEmbeddingsID || null,
      openrouter_api_key: openrouterAPIKey || null,
      background_model_id: backgroundModelId || null
    })

    const resolvedBgModel = backgroundModelId
      ? (availableLocalModels.find(m => m.modelId === backgroundModelId) ??
        null)
      : null
    setBackgroundModel(resolvedBgModel)
    setBackgroundModelMissing(false)

    setProfile(updatedProfile)
    if (chatSettings) setChatSettings({ ...chatSettings, prompt: systemPrompt })
    localStorage.setItem("murici_system_prompt", systemPrompt)

    toast.success(t("Profile updated!"))

    // OpenRouter keeps its own live discovery here, unchanged.
    if (!envKeyMap["openrouter"]) {
      const hasOpenRouterKey = !!updatedProfile.openrouter_api_key

      if (hasOpenRouterKey && availableOpenRouterModels.length === 0) {
        const openrouterModels: OpenRouterLLM[] = await fetchOpenRouterModels()
        setAvailableOpenRouterModels(prev => {
          const newModels = openrouterModels.filter(
            model =>
              !prev.some(prevModel => prevModel.modelId === model.modelId)
          )
          return [...prev, ...newModels]
        })
      } else if (!hasOpenRouterKey) {
        setAvailableOpenRouterModels([])
      }
    }

    // The six hosted providers (openai/google/azure/anthropic/mistral/groq/
    // perplexity) all resolve through fetchHostedModels — the same function
    // global-state.tsx calls on app load — instead of re-deriving
    // provider/key/model-list logic here. It fully recomputes the set for
    // the just-saved profile, so a plain replace (not merge-with-prev) is
    // correct.
    const hosted = await fetchHostedModels(updatedProfile)
    setAvailableHostedModels(hosted?.hostedModels ?? [])

    setIsOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      buttonRef.current?.click()
    }
  }

  if (!profile) return null

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        {profile.image_url ? (
          <Image
            className="mt-2 size-[34px] cursor-pointer rounded hover:opacity-50"
            src={profile.image_url + "?" + new Date().getTime()}
            height={34}
            width={34}
            alt={"Image"}
          />
        ) : (
          <Button size="icon" variant="ghost">
            <User size={SIDEBAR_ICON_SIZE} />
          </Button>
        )}
      </SheetTrigger>

      <SheetContent
        className="flex flex-col justify-between"
        side="left"
        onKeyDown={handleKeyDown}
      >
        <div className="grow overflow-auto">
          <SheetHeader>
            <SheetTitle>{t("Settings")}</SheetTitle>
          </SheetHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mt-4 grid w-full grid-cols-3">
              <TabsTrigger value="profile">{t("Profile")}</TabsTrigger>
              <TabsTrigger value="keys">{t("API Keys")}</TabsTrigger>
              <TabsTrigger value="mcp">{t("MCP Servers")}</TabsTrigger>
            </TabsList>

            <TabsContent className="mt-4 space-y-4" value="profile">
              <div className="space-y-1">
                <Label>{t("Language")}</Label>

                <Select
                  value={currentLocale}
                  onValueChange={v => setLocalePreference(v, router, pathname)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">
                      {t("System (Automatic)")}
                    </SelectItem>
                    {SUPPORTED_LOCALES.map(l => (
                      <SelectItem key={l} value={l}>
                        {LOCALE_DISPLAY_NAMES[l]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>{t("Profile Image")}</Label>

                <ImagePicker
                  src={profileImageSrc}
                  image={profileImageFile}
                  height={50}
                  width={50}
                  onSrcChange={setProfileImageSrc}
                  onImageChange={setProfileImageFile}
                />
              </div>

              <div className="space-y-1">
                <Label>{t("Chat Display Name")}</Label>

                <Input
                  placeholder={t("Chat display name...")}
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  maxLength={PROFILE_DISPLAY_NAME_MAX}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-sm">
                  {t(
                    "What would you like the AI to know about you to provide better responses?"
                  )}
                </Label>

                <TextareaAutosize
                  value={profileInstructions}
                  onValueChange={setProfileInstructions}
                  placeholder={t("Profile context... (optional)")}
                  minRows={6}
                  maxRows={10}
                />

                <LimitDisplay
                  used={profileInstructions.length}
                  limit={PROFILE_CONTEXT_MAX}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-sm">{t("System Prompt")}</Label>

                <TextareaAutosize
                  value={systemPrompt}
                  onValueChange={setSystemPrompt}
                  placeholder={defaultLocalePrompt()}
                  minRows={3}
                  maxRows={6}
                  className="border-2 border-input bg-background"
                />
              </div>

              <div className="space-y-1" data-dot-agent-ui="auto-task-model">
                <Label className="text-sm">
                  {t("Local model for background tasks")}
                </Label>

                {backgroundModelMissing && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {t(
                      "The configured local model was not found. Select another."
                    )}
                  </p>
                )}

                <Select
                  value={backgroundModelId || "__none__"}
                  onValueChange={v =>
                    setBackgroundModelId(v === "__none__" ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      {t("Use the chat's model")}
                    </SelectItem>
                    {availableLocalModels.map(m => (
                      <SelectItem key={m.modelId} value={m.modelId}>
                        {m.modelName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent className="mt-4 space-y-4" value="keys">
              <div className="mb-4">
                <Button
                  className="w-full text-xs font-semibold"
                  variant="outline"
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent("murici:sidebar-navigate", {
                        detail: "models"
                      })
                    )
                    setIsOpen(false)
                  }}
                >
                  {t("Manage Custom Models")}
                </Button>
              </div>

              <div className="mt-5 space-y-2">
                <Label className="flex items-center">
                  {useAzureOpenai
                    ? envKeyMap["azure"]
                      ? ""
                      : t("Azure OpenAI API Key")
                    : envKeyMap["openai"]
                      ? ""
                      : t("OpenAI API Key")}

                  <Button
                    className={cn(
                      "h-[18px] w-[150px] text-[11px]",
                      (useAzureOpenai && !envKeyMap["azure"]) ||
                        (!useAzureOpenai && !envKeyMap["openai"])
                        ? "ml-3"
                        : "mb-3"
                    )}
                    onClick={() => setUseAzureOpenai(!useAzureOpenai)}
                  >
                    {useAzureOpenai
                      ? t("Switch To Standard OpenAI")
                      : t("Switch To Azure OpenAI")}
                  </Button>
                </Label>

                {useAzureOpenai ? (
                  <>
                    {envKeyMap["azure"] ? (
                      <Label>{t("Azure OpenAI API key set by admin.")}</Label>
                    ) : (
                      <Input
                        placeholder={t("Azure OpenAI API Key")}
                        type="password"
                        value={azureOpenaiAPIKey}
                        onChange={e => setAzureOpenaiAPIKey(e.target.value)}
                      />
                    )}
                  </>
                ) : (
                  <>
                    {envKeyMap["openai"] ? (
                      <Label>{t("OpenAI API key set by admin.")}</Label>
                    ) : (
                      <Input
                        placeholder={t("OpenAI API Key")}
                        type="password"
                        value={openaiAPIKey}
                        onChange={e => setOpenaiAPIKey(e.target.value)}
                      />
                    )}
                  </>
                )}
              </div>

              <div className="ml-8 space-y-3">
                {useAzureOpenai ? (
                  <>
                    {
                      <div className="space-y-1">
                        {envKeyMap["azure_openai_endpoint"] ? (
                          <Label className="text-xs">
                            {t("Azure endpoint set by admin.")}
                          </Label>
                        ) : (
                          <>
                            <Label>{t("Azure Endpoint")}</Label>

                            <Input
                              placeholder="https://your-endpoint.openai.azure.com"
                              value={azureOpenaiEndpoint}
                              onChange={e =>
                                setAzureOpenaiEndpoint(e.target.value)
                              }
                            />
                          </>
                        )}
                      </div>
                    }

                    {
                      <div className="space-y-1">
                        {envKeyMap["azure_gpt_35_turbo_name"] ? (
                          <Label className="text-xs">
                            {t(
                              "Azure GPT-3.5 Turbo deployment name set by admin."
                            )}
                          </Label>
                        ) : (
                          <>
                            <Label>
                              {t("Azure GPT-3.5 Turbo Deployment Name")}
                            </Label>

                            <Input
                              placeholder={t(
                                "Azure GPT-3.5 Turbo Deployment Name"
                              )}
                              value={azureOpenai35TurboID}
                              onChange={e =>
                                setAzureOpenai35TurboID(e.target.value)
                              }
                            />
                          </>
                        )}
                      </div>
                    }

                    {
                      <div className="space-y-1">
                        {envKeyMap["azure_gpt_45_turbo_name"] ? (
                          <Label className="text-xs">
                            {t(
                              "Azure GPT-4.5 Turbo deployment name set by admin."
                            )}
                          </Label>
                        ) : (
                          <>
                            <Label>
                              {t("Azure GPT-4.5 Turbo Deployment Name")}
                            </Label>

                            <Input
                              placeholder={t(
                                "Azure GPT-4.5 Turbo Deployment Name"
                              )}
                              value={azureOpenai45TurboID}
                              onChange={e =>
                                setAzureOpenai45TurboID(e.target.value)
                              }
                            />
                          </>
                        )}
                      </div>
                    }

                    {
                      <div className="space-y-1">
                        {envKeyMap["azure_gpt_45_vision_name"] ? (
                          <Label className="text-xs">
                            {t(
                              "Azure GPT-4.5 Vision deployment name set by admin."
                            )}
                          </Label>
                        ) : (
                          <>
                            <Label>
                              {t("Azure GPT-4.5 Vision Deployment Name")}
                            </Label>

                            <Input
                              placeholder={t(
                                "Azure GPT-4.5 Vision Deployment Name"
                              )}
                              value={azureOpenai45VisionID}
                              onChange={e =>
                                setAzureOpenai45VisionID(e.target.value)
                              }
                            />
                          </>
                        )}
                      </div>
                    }

                    {
                      <div className="space-y-1">
                        {envKeyMap["azure_embeddings_name"] ? (
                          <Label className="text-xs">
                            {t(
                              "Azure Embeddings deployment name set by admin."
                            )}
                          </Label>
                        ) : (
                          <>
                            <Label>
                              {t("Azure Embeddings Deployment Name")}
                            </Label>

                            <Input
                              placeholder={t(
                                "Azure Embeddings Deployment Name"
                              )}
                              value={azureEmbeddingsID}
                              onChange={e =>
                                setAzureEmbeddingsID(e.target.value)
                              }
                            />
                          </>
                        )}
                      </div>
                    }
                  </>
                ) : (
                  <>
                    <div className="space-y-1">
                      {envKeyMap["openai_organization_id"] ? (
                        <Label className="text-xs">
                          {t("OpenAI Organization ID set by admin.")}
                        </Label>
                      ) : (
                        <>
                          <Label>{t("OpenAI Organization ID")}</Label>

                          <Input
                            placeholder={t("OpenAI Organization ID (optional)")}
                            disabled={
                              !!process.env.NEXT_PUBLIC_OPENAI_ORGANIZATION_ID
                            }
                            type="password"
                            value={openaiOrgID}
                            onChange={e => setOpenaiOrgID(e.target.value)}
                          />
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-1">
                {envKeyMap["anthropic"] ? (
                  <Label>{t("Anthropic API key set by admin.")}</Label>
                ) : (
                  <>
                    <Label>{t("Anthropic API Key")}</Label>
                    <Input
                      placeholder={t("Anthropic API Key")}
                      type="password"
                      value={anthropicAPIKey}
                      onChange={e => setAnthropicAPIKey(e.target.value)}
                    />
                  </>
                )}
              </div>

              <div className="space-y-1">
                {envKeyMap["google"] ? (
                  <Label>{t("Google Gemini API key set by admin.")}</Label>
                ) : (
                  <>
                    <Label>{t("Google Gemini API Key")}</Label>
                    <Input
                      placeholder={t("Google Gemini API Key")}
                      type="password"
                      value={googleGeminiAPIKey}
                      onChange={e => setGoogleGeminiAPIKey(e.target.value)}
                    />
                  </>
                )}
              </div>

              <div className="space-y-1">
                {envKeyMap["mistral"] ? (
                  <Label>{t("Mistral API key set by admin.")}</Label>
                ) : (
                  <>
                    <Label>{t("Mistral API Key")}</Label>
                    <Input
                      placeholder={t("Mistral API Key")}
                      type="password"
                      value={mistralAPIKey}
                      onChange={e => setMistralAPIKey(e.target.value)}
                    />
                  </>
                )}
              </div>

              <div className="space-y-1">
                {envKeyMap["groq"] ? (
                  <Label>{t("Groq API key set by admin.")}</Label>
                ) : (
                  <>
                    <Label>{t("Groq API Key")}</Label>
                    <Input
                      placeholder={t("Groq API Key")}
                      type="password"
                      value={groqAPIKey}
                      onChange={e => setGroqAPIKey(e.target.value)}
                    />
                  </>
                )}
              </div>

              <div className="space-y-1">
                {envKeyMap["perplexity"] ? (
                  <Label>{t("Perplexity API key set by admin.")}</Label>
                ) : (
                  <>
                    <Label>{t("Perplexity API Key")}</Label>
                    <Input
                      placeholder={t("Perplexity API Key")}
                      type="password"
                      value={perplexityAPIKey}
                      onChange={e => setPerplexityAPIKey(e.target.value)}
                    />
                  </>
                )}
              </div>

              <div className="space-y-1">
                {envKeyMap["openrouter"] ? (
                  <Label>{t("OpenRouter API key set by admin.")}</Label>
                ) : (
                  <>
                    <Label>{t("OpenRouter API Key")}</Label>
                    <Input
                      placeholder={t("OpenRouter API Key")}
                      type="password"
                      value={openrouterAPIKey}
                      onChange={e => setOpenrouterAPIKey(e.target.value)}
                    />
                  </>
                )}
              </div>
            </TabsContent>

            <TabsContent className="mt-4 space-y-4" value="mcp">
              <MCPSettings />
            </TabsContent>
          </Tabs>
        </div>

        <div className="mt-6 flex items-center">
          <div className="flex items-center space-x-1">
            <WithTooltip
              display={
                <div>
                  {t("Download Murici data as JSON. Import coming soon!")}
                </div>
              }
              trigger={
                <FileDown
                  className="cursor-pointer hover:opacity-50"
                  size={32}
                  onClick={exportLocalStorageAsJSON}
                />
              }
            />
          </div>

          <div className="ml-auto space-x-2">
            <Button variant="ghost" onClick={() => setIsOpen(false)}>
              {t("Cancel")}
            </Button>

            <Button ref={buttonRef} onClick={handleSave}>
              {t("Save")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
