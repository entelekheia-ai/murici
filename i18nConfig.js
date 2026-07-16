/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

const i18nConfig = {
  defaultLocale: "en",
  // Single-user local Electron app: no SEO/shareable-URL reason to carry a
  // locale segment in the path. With noPrefix, next-i18n-router's middleware
  // always internally rewrites (never redirects) regardless of which locale
  // is active — see i18nRouter.js. That's what makes a locale-less internal
  // navigation (router.push("/local/chat")) resolve identically on every
  // locale, instead of 307-redirecting on any non-default one, which used to
  // strand the App Router's RSC soft-navigation fetch and blank the screen.
  noPrefix: true,
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
