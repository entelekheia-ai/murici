/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { VALID_ENV_KEYS } from "@/types/valid-keys"
import { NextResponse } from "next/server"

export const runtime = "edge"

export async function GET() {
  const isUsingEnvKeyMap: Record<string, boolean> = {
    openai: !!process.env[VALID_ENV_KEYS.OPENAI_API_KEY],
    anthropic: !!process.env[VALID_ENV_KEYS.ANTHROPIC_API_KEY],
    google: !!process.env[VALID_ENV_KEYS.GOOGLE_GEMINI_API_KEY],
    mistral: !!process.env[VALID_ENV_KEYS.MISTRAL_API_KEY],
    groq: !!process.env[VALID_ENV_KEYS.GROQ_API_KEY],
    perplexity: !!process.env[VALID_ENV_KEYS.PERPLEXITY_API_KEY],
    azure: !!process.env[VALID_ENV_KEYS.AZURE_OPENAI_API_KEY],
    openrouter: !!process.env[VALID_ENV_KEYS.OPENROUTER_API_KEY],
    openai_organization_id:
      !!process.env[VALID_ENV_KEYS.OPENAI_ORGANIZATION_ID],
    azure_openai_endpoint: !!process.env[VALID_ENV_KEYS.AZURE_OPENAI_ENDPOINT],
    azure_gpt_35_turbo_name:
      !!process.env[VALID_ENV_KEYS.AZURE_GPT_35_TURBO_NAME],
    azure_gpt_45_turbo_name:
      !!process.env[VALID_ENV_KEYS.AZURE_GPT_45_TURBO_NAME],
    azure_gpt_45_vision_name:
      !!process.env[VALID_ENV_KEYS.AZURE_GPT_45_VISION_NAME],
    azure_embeddings_name: !!process.env[VALID_ENV_KEYS.AZURE_EMBEDDINGS_NAME]
  }

  return NextResponse.json({ isUsingEnvKeyMap })
}
