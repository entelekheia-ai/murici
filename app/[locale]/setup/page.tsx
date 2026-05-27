"use client"

// Setup page is not needed in the local-only fork.
// Redirects directly to the local workspace.
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function SetupPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/local/chat")
  }, [router])

  return null
}
