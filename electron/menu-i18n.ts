/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { app } from "electron"
import * as fs from "fs"
import * as path from "path"

// The main process has no React/i18next context, so menu labels are read
// straight out of the same public/locales/<locale>/translation.json files
// the renderer uses (key = English source string), rather than duplicating
// a second translation pipeline.
function localesDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "server", "public", "locales")
    : path.join(__dirname, "..", "public", "locales")
}

const fileCache = new Map<string, Record<string, string>>()

function loadLocaleFile(locale: string): Record<string, string> {
  if (fileCache.has(locale)) return fileCache.get(locale)!
  let data: Record<string, string> = {}
  try {
    const filePath = path.join(localesDir(), locale, "translation.json")
    data = JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch {
    // Locale not shipped (or unreadable) — callers fall back to English.
  }
  fileCache.set(locale, data)
  return data
}

// Returns a translator bound to `locale`, falling back to English and then
// to the key itself, mirroring i18next's default "key as source text" setup.
export function loadMenuStrings(locale: string): (key: string) => string {
  const primary = loadLocaleFile(locale)
  const fallback = locale === "en" ? primary : loadLocaleFile("en")
  return (key: string) => primary[key] ?? fallback[key] ?? key
}
