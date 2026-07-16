"use client"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import Loading from "./loading"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function HomePage() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/local/chat")
  }, [router])
  // Render the spinner instead of null: if the redirect ever stalls or fails
  // (the exact failure mode that caused the locale-less-navigation blank
  // screen — see i18nConfig.js's noPrefix comment), the user sees a loading
  // state instead of a blank window with no way to tell what's happening.
  return <Loading />
}
