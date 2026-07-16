"use client"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

// Setup page is not needed in the local-only fork.
// Redirects directly to the local workspace.
import Loading from "../loading"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function SetupPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/local/chat")
  }, [router])

  // See app/[locale]/page.tsx — a stalled redirect should show a spinner,
  // not a blank screen.
  return <Loading />
}
