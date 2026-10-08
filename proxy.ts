// SPDX-License-Identifier: Apache-2.0 AND MIT
// Portions from Chatbot UI (McKay Wrigley) — see NOTICE

import { i18nRouter } from "next-i18n-router"
import { NextResponse, type NextRequest } from "next/server"
import i18nConfig from "./i18nConfig"

export function proxy(request: NextRequest) {
  const i18nResult = i18nRouter(request, i18nConfig)
  if (i18nResult) return i18nResult
  return NextResponse.next()
}

export const config = {
  matcher: "/((?!api|static|.*\\..*|_next|auth).*)"
}
