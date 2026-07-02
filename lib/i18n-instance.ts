/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import type { i18n as I18nInstance } from "i18next"

// TranslationsProvider creates a fresh i18next instance per mount (see
// lib/i18n.ts) and only exposes it through React context. Plain modules like
// chat-helpers/index.ts run outside any component and have no hook access,
// so the active instance is mirrored here to give them a `t()` escape hatch.
let activeInstance: I18nInstance | null = null

export function setActiveI18n(instance: I18nInstance) {
  activeInstance = instance
}

export function t(key: string, options?: Record<string, any>): string {
  if (!activeInstance) return key
  return activeInstance.t(key, options) as string
}
