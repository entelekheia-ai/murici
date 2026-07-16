/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

const i18nConfig = {
  defaultLocale: "en",
  // prefixDefault:true — every locale, including the default, carries an
  // explicit URL prefix. Two prior approaches were tried and reverted for
  // issue #3:
  //   1. noPrefix:true — caused a runaway rewrite recursion in the packaged
  //      standalone production server (fine under `next dev`, broken under
  //      the Electron-bundled standalone server).
  //   2. prefixDefault:false (the original setting) + always constructing a
  //      locale-aware href — this removed the *app's* locale-less
  //      navigations, but next-i18n-router's own middleware still issues a
  //      NextResponse.rewrite() for any request that resolves to the
  //      default locale, and under real (concurrent) Electron browser
  //      traffic that rewrite target got re-processed by the middleware a
  //      second time, which redirects a default-locale-prefixed path back
  //      to bare — producing a self-redirect loop (curl couldn't reproduce
  //      it; only real navigation traffic triggered the race).
  // prefixDefault:true avoids both failure modes structurally: once a
  // request already carries its locale prefix (the steady-state case for
  // every navigation in this app, since lib/locale-href.ts always includes
  // it), the middleware does a plain NextResponse.next() passthrough — no
  // rewrite, nothing to re-process. Only the very first locale-less hit
  // (bare "/") issues one redirect, ever.
  prefixDefault: true,
  locales: [
    "ar",
    "bn",
    "de",
    "en",
    "es",
    "fr",
    "he",
    "id",
    "it",
    "ja",
    "ko",
    "pt",
    "pt-BR",
    "ru",
    "si",
    "sv",
    "te",
    "vi",
    "zh"
  ]
}

module.exports = i18nConfig
