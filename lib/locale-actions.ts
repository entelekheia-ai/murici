/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

const LOCALE_COOKIE = "NEXT_LOCALE"

interface MinimalRouter {
  refresh: () => void
}

// With i18nConfig.noPrefix, URLs never carry a locale segment — middleware
// always internally rewrites to the cookie's locale (or detects one), so
// switching locale is just a cookie write + refresh; no path to rewrite.
//
// "system" clears the pinned cookie so middleware re-runs Accept-Language
// detection on the next request (next-i18n-router's own cookie, once set,
// otherwise wins forever — see i18nRouter.js). A concrete locale pins it.
export function setLocalePreference(
  locale: "system" | string,
  router: MinimalRouter
): void {
  if (locale === "system") {
    document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0; samesite=lax`
  } else {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`
  }
  router.refresh()
  // translations-provider.tsx's own effect notifies Electron once the new
  // `locale` route param flows back down — no need to duplicate that call.
  // electron/main.ts also persists the choice to ~/.config/murici/config.json
  // via that same IPC call, so the next launch's initial locale doesn't have
  // to guess from the OS.
}
