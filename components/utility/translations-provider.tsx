/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

"use client"

import initTranslations from "@/lib/i18n"
import { setActiveI18n } from "@/lib/i18n-instance"
import { createInstance } from "i18next"
import { I18nextProvider } from "react-i18next"

export default function TranslationsProvider({
  children,
  locale,
  namespaces,
  resources
}: any) {
  const i18n = createInstance()

  initTranslations(locale, namespaces, i18n, resources)
  setActiveI18n(i18n)

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
}
