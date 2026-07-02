/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { useEffect, useState } from "react"
import { highlightDsl, type DslLangId, type DslToken } from "@/lib/dsl-highlight"

interface DslHighlightedCodeProps {
  language: DslLangId
  value: string
}

// Presentational only — no wrapping <pre>. Callers own their own <pre>/box
// styling (chat code block chrome vs. the right-sidebar debug panel box),
// this just renders the tokenized <code> content.
export function DslHighlightedCode({ language, value }: DslHighlightedCodeProps) {
  const [tokens, setTokens] = useState<DslToken[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setTokens(null)
    highlightDsl(language, value)
      .then(result => {
        if (!cancelled) setTokens(result)
      })
      .catch(err => {
        console.error("DSL highlight failed:", err)
        if (!cancelled) setTokens([{ text: value }])
      })
    return () => {
      cancelled = true
    }
  }, [language, value])

  if (!tokens) return <code>{value}</code>

  return (
    <code>
      {tokens.map((token, i) =>
        token.className ? (
          <span key={i} className={token.className}>
            {token.text}
          </span>
        ) : (
          <span key={i}>{token.text}</span>
        )
      )}
    </code>
  )
}
