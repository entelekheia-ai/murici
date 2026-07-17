/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

// Native display names for the language picker in Settings. Only the
// locales that actually ship a public/locales/<locale>/translation.json —
// i18nConfig.js declares more locale codes than are currently translated.
// Kept separate from lib/errors/auto-translate.ts's LOCALE_LANGUAGE_NAMES,
// which serves a different purpose (English names fed to an LLM prompt).
export const SUPPORTED_LOCALES = ["en", "pt", "pt-BR", "es", "de"] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export const LOCALE_DISPLAY_NAMES: Record<SupportedLocale, string> = {
  en: "English",
  pt: "Português",
  "pt-BR": "Português (Brasil)",
  es: "Español",
  de: "Deutsch"
}
