/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import i18nConfig from "@/i18nConfig"

const LOCALE_COOKIE = "NEXT_LOCALE"

interface MinimalRouter {
  push: (href: string) => void
  refresh: () => void
}

function pathWithoutLocale(pathname: string): string {
  const match = i18nConfig.locales.find(
    (locale: string) =>
      pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)
  )
  if (!match) return pathname
  return pathname.slice(`/${match}`.length) || "/"
}

// "system" clears the pinned cookie so middleware re-runs Accept-Language
// detection on the next request (next-i18n-router's own cookie, once set,
// otherwise wins forever — see i18nRouter.js). A concrete locale pins it.
export function setLocalePreference(
  locale: "system" | string,
  router: MinimalRouter,
  pathname: string
): void {
  const bare = pathWithoutLocale(pathname)

  if (locale === "system") {
    document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0; samesite=lax`
    router.push(bare === "/" ? "/" : bare)
    router.refresh()
    return
  }

  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`
  const prefixed =
    locale === i18nConfig.defaultLocale
      ? bare
      : `/${locale}${bare === "/" ? "" : bare}`
  router.push(prefixed)
  router.refresh()
  // translations-provider.tsx's own effect notifies Electron once the new
  // `locale` route param flows back down — no need to duplicate that call.
}
