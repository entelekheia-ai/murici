import { getSetting, setSetting } from "@/lib/local-db/settings"

const PROFILE_KEYS = [
  "openai_api_key",
  "anthropic_api_key",
  "google_gemini_api_key",
  "mistral_api_key",
  "groq_api_key",
  "perplexity_api_key",
  "azure_openai_api_key",
  "openrouter_api_key",
  "openai_organization_id",
  "azure_openai_endpoint",
  "azure_openai_35_turbo_id",
  "azure_openai_45_vision_id",
  "azure_openai_45_turbo_id",
  "azure_openai_embeddings_id",
  "use_azure_openai",
  "profile_context",
  "display_name"
]

function defaultProfile() {
  return {
    id: "local",
    user_id: "local",
    username: "local",
    display_name: "",
    bio: "",
    profile_context: "",
    has_onboarded: true,
    image_url: "",
    image_path: "",
    use_azure_openai: false,
    openai_api_key: null,
    anthropic_api_key: null,
    google_gemini_api_key: null,
    mistral_api_key: null,
    groq_api_key: null,
    perplexity_api_key: null,
    azure_openai_api_key: null,
    openrouter_api_key: null,
    openai_organization_id: null,
    azure_openai_endpoint: null,
    azure_openai_35_turbo_id: null,
    azure_openai_45_vision_id: null,
    azure_openai_45_turbo_id: null,
    azure_openai_embeddings_id: null,
    created_at: new Date().toISOString(),
    updated_at: null
  }
}

export async function getProfileByUserId(userId: string): Promise<any> {
  // Server-side (SSR) — return stub immediately, no IndexedDB
  if (typeof window === "undefined") return defaultProfile()

  const profile: any = defaultProfile()
  for (const key of PROFILE_KEYS) {
    const value = await getSetting(`profile_${key}`)
    if (value !== null) {
      if (key === "use_azure_openai") {
        profile[key] = value === "true"
      } else {
        profile[key] = value
      }
    }
  }
  return profile
}

export async function updateProfile(userId: string, data: any): Promise<any> {
  if (typeof window === "undefined") return { id: "local", ...data }

  for (const key of PROFILE_KEYS) {
    if (key in data && data[key] !== null && data[key] !== undefined) {
      await setSetting(`profile_${key}`, String(data[key]))
    }
  }
  return { id: "local", user_id: "local", ...data }
}
