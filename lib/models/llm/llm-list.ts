/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import { LLM } from "@/types"
import { OPENAI_LLM_LIST } from "./openai-llm-list"
import { PERPLEXITY_LLM_LIST } from "./perplexity-llm-list"

// google/anthropic/mistral/groq don't have a static list at all anymore —
// those providers are discovered live from each provider's API (see
// app/api/models/discover-remote/route.ts + fetchHostedModels in
// lib/models/fetch-models.ts), because hardcoded ids go stale as providers
// deprecate models (this is what LLM_LIST used to ship: retired ids like
// gemini-1.5-flash / gpt-4-turbo-preview, 404ing at request time). There's no
// old chat history to protect, so those 4 files were deleted outright rather
// than kept around for historical lookups.
// OpenAI's own list survives only because Azure OpenAI reuses it as the base
// set of deployment display names (see openai-llm-list.ts) — it no longer
// feeds the OpenAI branch of the picker either. Perplexity (no public
// list-models endpoint) is the only provider still genuinely static by
// design, discovery was never an option for it.
export const LLM_LIST: LLM[] = [...OPENAI_LLM_LIST, ...PERPLEXITY_LLM_LIST]

export const LLM_LIST_MAP: Record<string, LLM[]> = {
  openai: OPENAI_LLM_LIST,
  azure: OPENAI_LLM_LIST,
  perplexity: PERPLEXITY_LLM_LIST
}
