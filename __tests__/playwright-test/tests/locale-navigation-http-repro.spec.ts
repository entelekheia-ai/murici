/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { test, expect } from "@playwright/test"

/*
 * HTTP-LAYER REGRESSION GUARD — locale-less internal navigation used to
 * blank the app on a non-default locale (issue #3).
 *
 * Root cause: several router.push/replace calls built a locale-less path
 * (e.g. "/local/chat"). Two fixes were tried and reverted before landing on
 * the current one:
 *   1. i18nConfig's noPrefix:true — worked under `next dev`, but caused a
 *      runaway rewrite recursion in the packaged standalone production
 *      server.
 *   2. prefixDefault:false (the original setting) + a locale-href helper
 *      that omitted the prefix for the default locale — this removed the
 *      app's locale-less navigations, but the middleware still had to
 *      NextResponse.rewrite() bare default-locale requests, and under real
 *      (concurrent) Electron browser traffic that rewrite target got
 *      re-processed by the middleware a second time, redirecting back to
 *      bare and producing a self-redirect loop that curl could never
 *      reproduce.
 *
 * Fix: i18nConfig.js sets prefixDefault:true, and lib/locale-href.ts's
 * localeHref() always includes the active locale, including the default
 * one. Once a request already carries its locale prefix, the middleware
 * does a plain passthrough (NextResponse.next()) — no rewrite is ever
 * involved for a correctly-built href, on any locale. Only a locale-less
 * path (which the app must never construct) still redirects, exactly once.
 */

const WORKSPACE_PATH = "/local/chat"

test.describe("locale-aware navigation vs next-i18n-router (prefixDefault:true)", () => {
  test("a locale-prefixed path resolves 200 with no redirect, on the default locale", async ({
    playwright
  }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:3000"
    })
    const res = await ctx.get(`/en${WORKSPACE_PATH}`, { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    await ctx.dispose()
  })

  test("a locale-prefixed path resolves 200 with no redirect, on a non-default locale", async ({
    playwright
  }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:3000"
    })
    const res = await ctx.get(`/pt${WORKSPACE_PATH}`, { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    await ctx.dispose()
  })

  test("a locale-LESS path redirects to the default locale exactly once (the app must never construct this)", async ({
    playwright
  }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:3000"
    })
    const res = await ctx.get(WORKSPACE_PATH, { maxRedirects: 0 })
    expect(res.status()).toBe(307)
    expect(res.headers()["location"]).toContain(`/en${WORKSPACE_PATH}`)
    await ctx.dispose()
  })

  test("a locale-LESS path redirects to a non-default cookie locale exactly once", async ({
    playwright
  }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:3000",
      extraHTTPHeaders: { Cookie: "NEXT_LOCALE=pt" }
    })
    const res = await ctx.get(WORKSPACE_PATH, { maxRedirects: 0 })
    expect(res.status()).toBe(307)
    expect(res.headers()["location"]).toContain(`/pt${WORKSPACE_PATH}`)
    await ctx.dispose()
  })

  test("following that single redirect lands cleanly with no further redirect", async ({
    playwright
  }) => {
    const ctx = await playwright.request.newContext({
      baseURL: "http://localhost:3000"
    })
    const res = await ctx.get(WORKSPACE_PATH)
    expect(res.status()).toBe(200)
    await ctx.dispose()
  })
})
