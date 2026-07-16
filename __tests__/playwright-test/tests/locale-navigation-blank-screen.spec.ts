/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { test, expect } from "@playwright/test"

/*
 * REGRESSION GUARD — locale-less navigation used to blank the app on a
 * non-default locale (issue #3, fixed via i18nConfig.js's noPrefix:true).
 *
 * Root cause (pre-existing, predates the i18n text sweep in f3f9532):
 * several navigations build locale-LESS paths — most importantly the root
 * page `app/[locale]/page.tsx` which runs `router.replace("/local/chat")` on
 * EVERY load, plus setup/page.tsx, chat-handler-provider.tsx,
 * workspace-switcher.tsx, sidebar.tsx and sidebar-display-item.tsx.
 *
 * With the old URL-prefixed locale scheme (prefixDefault:false), the default
 * locale ("en") had no URL prefix and a locale-less path REWROTE cleanly
 * (200) — English users never saw a problem. But on ANY non-default locale
 * the middleware 307-REDIRECTED a locale-less path to the prefixed one (e.g.
 * /local/chat -> /pt/local/chat). For a client-side (RSC) soft-navigation
 * that 307 carried no component payload, so the App Router's RSC fetch
 * failed ("Failed to fetch RSC payload ... Falling back to browser
 * navigation") and the root HomePage — which rendered null while it waited
 * for its redirect — was left stuck: a blank screen. In Electron the
 * repeated hard-nav/redirect cycle surfaced as ERR_TOO_MANY_REDIRECTS (see
 * ~/Library/Logs/murici/main.log).
 *
 * Fix: i18nConfig.js now sets noPrefix:true, so the middleware always
 * internally rewrites (never redirects) regardless of locale — locale-less
 * paths are universally correct. The seven call sites that used to build an
 * explicit `/${locale}/...` path (which would now double-prefix) were
 * stripped back to locale-less paths. app/[locale]/page.tsx and setup/page.tsx
 * also now render <Loading/> instead of null while the redirect is pending,
 * as defense in depth against any future stalled-redirect scenario.
 *
 * This test seeds a non-default locale and asserts the app actually reaches a
 * rendered chat shell (the knowledge/graph landing view) instead of blanking.
 * It needs no model server — the empty-state landing renders without replies.
 *
 * NOTE ON MECHANISM COVERAGE: a plain browser may self-heal the redirect that
 * Electron loops on (the hard-nav fallback follows the 307), so a green result
 * here does not by itself prove the Electron-specific loop is gone. The
 * load-bearing assertion is at the HTTP layer, see
 * locale-navigation-http-repro.spec.ts: app-internal paths must not 307 on
 * any locale.
 */

test("app renders (not a blank screen) when the active locale is non-default", async ({
  context,
  page
}) => {
  await context.addCookies([
    {
      name: "NEXT_LOCALE",
      value: "pt",
      domain: "localhost",
      path: "/"
    }
  ])

  const rscFailures: string[] = []
  page.on("console", msg => {
    const text = msg.text()
    if (/Failed to fetch RSC payload/i.test(text)) rscFailures.push(text)
  })

  // Mirror the real entrypoint: load the site root, which renders the root
  // HomePage whose only job is router.replace("/local/chat").
  await page.goto("/", { waitUntil: "domcontentloaded" })

  // The app should land on the workspace chat shell. The empty-state landing
  // is KnowledgeHomeView; its header title ("Knowledge"/"Conhecimento") or the
  // chat input textarea are stable, model-independent anchors.
  const chatInput = page.getByRole("textbox").first()
  await expect(chatInput).toBeVisible({ timeout: 15_000 })

  // Diagnostic: surface the RSC-payload failure that accompanies the bug.
  expect(
    rscFailures,
    `RSC payload fetch failed during locale-less navigation:\n${rscFailures.join("\n")}`
  ).toHaveLength(0)
})
