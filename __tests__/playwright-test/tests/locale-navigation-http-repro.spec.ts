/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { test, expect } from "@playwright/test"

/*
 * HTTP-LAYER REGRESSION GUARD — locale-less internal navigation must never
 * 307-redirect (see locale-navigation-blank-screen.spec.ts for the
 * user-facing symptom this used to cause, and issue #3 for the full
 * root-cause writeup).
 *
 * Before the fix, i18nConfig.js had prefixDefault:false with a URL-prefixed
 * locale scheme: a locale-less path (e.g. "/local/chat", built by
 * router.replace/push calls that never included a locale segment) rewrote
 * cleanly (200) only on the default locale ("en"); on any other locale the
 * middleware 307-redirected it to the prefixed path. For a client-side (RSC)
 * soft-navigation, that 307 carried no component payload, so the App
 * Router's RSC fetch failed and fell back to a hard reload — which is what
 * surfaced as a blank screen / ERR_TOO_MANY_REDIRECTS in Electron.
 *
 * The fix sets noPrefix:true: the middleware now always internally rewrites
 * (never redirects), on every locale, so locale-less paths are universally
 * correct and a visibly-prefixed path (e.g. "/pt/local/chat") is no longer a
 * route the app ever constructs (verified 404 below).
 */

const INTERNAL_PATH = "/local/chat"

test.describe("locale-less internal navigation vs next-i18n-router (noPrefix)", () => {
  test("a locale-less internal path resolves 200 on a non-default locale", async ({
    playwright
  }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: { Cookie: "NEXT_LOCALE=pt" }
    })
    const res = await ctx.get(INTERNAL_PATH, { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    await ctx.dispose()
  })

  test("an RSC soft-navigation request to that path also resolves 200 (no stranded fetch)", async ({
    playwright
  }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: { Cookie: "NEXT_LOCALE=pt", RSC: "1" }
    })
    const res = await ctx.get(INTERNAL_PATH, { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    await ctx.dispose()
  })

  test("the same path resolves 200 on the default locale too", async ({
    playwright
  }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: { Cookie: "NEXT_LOCALE=en" }
    })
    const res = await ctx.get(INTERNAL_PATH, { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    await ctx.dispose()
  })

  test("resolves 200 even with no cookie at all (first-launch, no prior locale pinned)", async ({
    playwright
  }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: { "Accept-Language": "pt-BR" }
    })
    const res = await ctx.get(INTERNAL_PATH, { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    await ctx.dispose()
  })

  test("a visibly-prefixed path is no longer a route the app should reach (guards against regression)", async ({
    playwright
  }) => {
    // With noPrefix, nothing should ever construct "/pt/..." — if this starts
    // returning 200 again, a call site regressed back to manual locale
    // prefixing (the pattern removed from knowledge-graph-canvas.tsx et al.).
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: { Cookie: "NEXT_LOCALE=pt" }
    })
    const res = await ctx.get("/pt/local/chat", { maxRedirects: 0 })
    expect(res.status()).toBe(404)
    await ctx.dispose()
  })
})
