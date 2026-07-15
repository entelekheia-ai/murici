/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { runHeadlessAgent } from "@/lib/runtime/headless-runner"
import { LLM } from "@/types"

const LOCALE_LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  pt: "Portuguese",
  "pt-BR": "Brazilian Portuguese",
  de: "German",
  es: "Spanish"
}

export function localeToLanguageName(locale: string): string {
  return LOCALE_LANGUAGE_NAMES[locale] || locale
}

export function buildTranslateContent(message: string, languageName: string): string {
  return `${message}\n\nTarget language: ${languageName}`
}

const TRANSLATE_JSON_INSTRUCTION =
  'Respond ONLY as JSON: { "intent_name": "save_translation", "translated": "..." }'

// Best-effort: used to translate error messages for display, never blocks or
// throws on the caller. Mirrors lib/knowledge/enrich.ts's headless pattern
// against the same background.agent bundle (state "translate").
export async function translateErrorMessage(
  message: string,
  modelData: LLM,
  locale: string
): Promise<string | null> {
  try {
    const result = await runHeadlessAgent(
      buildTranslateContent(message, localeToLanguageName(locale)),
      modelData,
      "/agents/background.agent",
      "run_translation",
      TRANSLATE_JSON_INSTRUCTION
    )
    return result?.translated || null
  } catch {
    return null
  }
}
