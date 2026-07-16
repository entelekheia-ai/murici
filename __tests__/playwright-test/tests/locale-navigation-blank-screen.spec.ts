/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { test, expect } from "@playwright/test"

/*
 * REGRESSION GUARD — locale-less navigation used to blank the app on a
 * non-default locale (issue #3).
 *
 * Root cause (pre-existing, predates the i18n text sweep in f3f9532):
 * several navigations built locale-LESS paths — most importantly the root
 * page `app/[locale]/page.tsx` which ran `router.replace("/local/chat")` on
 * EVERY load, plus setup/page.tsx, chat-handler-provider.tsx,
 * workspace-switcher.tsx, sidebar.tsx and sidebar-display-item.tsx (and 5
 * more sites that built an explicit but ALWAYS-locale-prefixed path, which
 * is equally wrong on the default locale — see below).
 *
 * With prefixDefault:false, the default locale ("en") has no URL prefix and
 * a locale-less path REWRITES cleanly (200) — English users never saw a
 * problem. But on ANY non-default locale the middleware 307-REDIRECTS a
 * locale-less path to the prefixed one (e.g. /local/chat -> /pt/local/chat).
 * For a client-side (RSC) soft-navigation that 307 carries no component
 * payload, so the App Router's RSC fetch fails ("Failed to fetch RSC payload
 * ... Falling back to browser navigation") and the root HomePage — which
 * rendered null while it waited for its redirect — was left stuck: a blank
 * screen. In Electron the repeated hard-nav/redirect cycle surfaced as
 * ERR_TOO_MANY_REDIRECTS (see ~/Library/Logs/murici/main.log).
 *
 * Fix: i18nConfig.js sets prefixDefault:true, and every router.push/replace
 * now goes through lib/locale-href.ts's localeHref(locale, path), which
 * always includes the active locale — including the default one. Once a
 * request already carries its locale prefix, the middleware does a plain
 * passthrough (no NextResponse.rewrite() involved), so there's no rewrite
 * target left for the middleware to ever re-process. Two other approaches
 * were tried and reverted first: noPrefix:true (fine under `next dev`, but
 * caused a runaway rewrite recursion in the packaged standalone production
 * server), and prefixDefault:false + omitting the prefix only for the
 * default locale (removed the app's locale-less navigations, but the
 * middleware's own rewrite of bare default-locale requests could still get
 * re-processed under real concurrent Electron traffic, producing a
 * self-redirect loop curl could never reproduce). electron/main.ts also now
 * loads the fully-resolved locale-prefixed URL directly instead of bare "/",
 * and app/[locale]/page.tsx / setup/page.tsx render <Loading/> instead of
 * null while any redirect is pending, as defense in depth.
 *
 * This test seeds a non-default locale and asserts the app actually reaches a
 * rendered chat shell (the knowledge/graph landing view) instead of blanking.
 * It needs no model server — the empty-state landing renders without replies.
 *
 * NOTE ON MECHANISM COVERAGE: a plain browser may self-heal a redirect that
 * Electron would loop on (the hard-nav fallback follows the 307), so a green
 * result here does not by itself prove an Electron-specific loop is gone.
 * The load-bearing assertions are at the HTTP layer, see
 * locale-navigation-http-repro.spec.ts.
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
