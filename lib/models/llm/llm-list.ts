/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import { LLM } from "@/types"
import { ANTHROPIC_LLM_LIST } from "./anthropic-llm-list"
import { GOOGLE_LLM_LIST } from "./google-llm-list"
import { MISTRAL_LLM_LIST } from "./mistral-llm-list"
import { GROQ_LLM_LIST } from "./groq-llm-list"
import { OPENAI_LLM_LIST } from "./openai-llm-list"
import { PERPLEXITY_LLM_LIST } from "./perplexity-llm-list"

// openai/google/anthropic/mistral/groq no longer populate the selectable
// model dropdown — those providers are discovered live from each provider's
// API (see app/api/models/discover-remote/route.ts + fetchHostedModels in
// lib/models/fetch-models.ts), because these hardcoded ids go stale as
// providers deprecate models (this is what LLM_LIST used to ship: retired
// ids like gemini-1.5-flash / gpt-4-turbo-preview, 404ing at request time).
// LLM_LIST is kept only so old chat messages/presets that reference one of
// these ids can still resolve a display name/icon — it is merged with the
// live-discovered list at each call site (see chat-handler-provider.tsx,
// chat-input.tsx, use-select-file-handler.tsx, message.tsx), never used
// alone for anything user-selectable. Perplexity (no public list-models
// endpoint) and Azure (deployments, not discoverable models) are the only
// providers still resolved directly from LLM_LIST_MAP at selection time.
export const LLM_LIST: LLM[] = [
  ...OPENAI_LLM_LIST,
  ...GOOGLE_LLM_LIST,
  ...MISTRAL_LLM_LIST,
  ...GROQ_LLM_LIST,
  ...PERPLEXITY_LLM_LIST,
  ...ANTHROPIC_LLM_LIST
]

export const LLM_LIST_MAP: Record<string, LLM[]> = {
  openai: OPENAI_LLM_LIST,
  azure: OPENAI_LLM_LIST,
  google: GOOGLE_LLM_LIST,
  mistral: MISTRAL_LLM_LIST,
  groq: GROQ_LLM_LIST,
  perplexity: PERPLEXITY_LLM_LIST,
  anthropic: ANTHROPIC_LLM_LIST
}
