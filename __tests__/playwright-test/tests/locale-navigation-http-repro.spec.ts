/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { test, expect } from "@playwright/test"

/*
 * HTTP-LAYER REPRODUCTION — the deterministic core of the locale-less
 * navigation bug (see locale-navigation-blank-screen.spec.ts for the
 * user-facing symptom and full root-cause writeup).
 *
 * These assertions describe the CURRENT (buggy) middleware behaviour so the
 * defect is captured in an Electron-independent way. `test.fixme` marks the
 * DESIRED post-fix behaviour that does not hold yet.
 *
 * Verified equivalent with curl against `npm run dev`:
 *   /local/chat  (no cookie, Accept-Language pt-BR) -> 307 -> /pt/local/chat
 *   /local/chat  (cookie NEXT_LOCALE=pt)            -> 307 -> /pt/local/chat
 *   /local/chat  (cookie NEXT_LOCALE=en, default)   -> 200 (internal rewrite)
 *   /pt/local/chat (RSC header)                     -> 200 text/x-component
 *   /local/chat  (RSC header, cookie pt)            -> 307, no RSC payload  <-- breaks soft-nav
 */

const LOCALE_LESS_INTERNAL_PATH = "/local/chat"

test.describe("locale-less internal navigation vs next-i18n-router", () => {
  test("CURRENT: a locale-less internal path 307-redirects on a non-default locale", async ({
    playwright
  }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: { Cookie: "NEXT_LOCALE=pt" }
    })
    const res = await ctx.get(LOCALE_LESS_INTERNAL_PATH, { maxRedirects: 0 })
    expect(res.status()).toBe(307)
    expect(res.headers()["location"]).toContain("/pt/local/chat")
    await ctx.dispose()
  })

  test("CURRENT: an RSC soft-navigation request to that path 307s with no component payload", async ({
    playwright
  }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: { Cookie: "NEXT_LOCALE=pt", RSC: "1" }
    })
    const res = await ctx.get(LOCALE_LESS_INTERNAL_PATH, { maxRedirects: 0 })
    expect(res.status()).toBe(307)
    // A 307 (not an RSC 200/text/x-component) is exactly what makes the App
    // Router's soft-navigation fetch fall back to a hard reload.
    expect(res.headers()["content-type"] ?? "").not.toContain("x-component")
    await ctx.dispose()
  })

  test("CONTROL: on the default locale the same path resolves 200 (why English never broke)", async ({
    playwright
  }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: { Cookie: "NEXT_LOCALE=en" }
    })
    const res = await ctx.get(LOCALE_LESS_INTERNAL_PATH, { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    await ctx.dispose()
  })

  test.fixme("DESIRED: app-internal navigation must not 307 while on a non-default locale", async ({
    playwright
  }) => {
    // Post-fix, either (a) navigations always carry the active locale so this
    // locale-less path is never requested, or (b) locale routing no longer
    // uses a visible URL prefix (noPrefix), so the path rewrites (200) on
    // every locale. Whichever approach is chosen, a real soft-navigation the
    // app performs must never resolve to a 307 that strands the RSC fetch.
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: { Cookie: "NEXT_LOCALE=pt" }
    })
    const res = await ctx.get(LOCALE_LESS_INTERNAL_PATH, { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    await ctx.dispose()
  })
})
