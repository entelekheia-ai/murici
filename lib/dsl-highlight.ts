/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Browser-side tree-sitter syntax highlighting for the dot-agent DSL
 * (.description / .behavior). Reuses the grammars + highlights.scm shipped by
 * @dot-agent/tree-sitter, copied into public/tree-sitter/ by
 * scripts/copy-tree-sitter-assets.js (node_modules paths aren't fetchable
 * from the browser, so @dot-agent/compiler's Node-only parser.ts can't be
 * reused here directly).
 */

import { Parser, Language, Query, type Tree } from "web-tree-sitter"

export type DslLangId = "description" | "behavior"

export interface DslToken {
  text: string
  className?: string
}

// Tailwind classes chosen to sit alongside the oneDark Prism theme used for
// every other language in MessageCodeBlock.
const CAPTURE_STYLES: Record<string, string> = {
  keyword: "text-fuchsia-400",
  "keyword.operator": "text-fuchsia-300",
  type: "text-yellow-300",
  "type.definition": "text-yellow-300 font-semibold",
  "type.builtin": "text-yellow-500",
  namespace: "text-cyan-400",
  string: "text-green-400",
  "string.special": "text-green-300",
  "string.documentation": "text-green-200 italic",
  number: "text-orange-400",
  boolean: "text-orange-400",
  "constant.builtin": "text-orange-300",
  comment: "text-zinc-500 italic",
  property: "text-sky-300",
  attribute: "text-sky-400",
  operator: "text-zinc-300",
  "punctuation.delimiter": "text-zinc-400",
  "punctuation.bracket": "text-zinc-400",
  variable: "text-zinc-200"
}

const WASM_BASE = "/tree-sitter"

interface LangRuntime {
  parser: Parser
  query: Query
}

let initPromise: Promise<Record<DslLangId, LangRuntime>> | null = null

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  return res.text()
}

async function buildRuntime(grammarWasm: string, highlightsScm: string): Promise<LangRuntime> {
  const [language, scmSource] = await Promise.all([
    Language.load(`${WASM_BASE}/${grammarWasm}`),
    fetchText(`${WASM_BASE}/${highlightsScm}`)
  ])
  const parser = new Parser()
  parser.setLanguage(language)
  const query = new Query(language, scmSource)
  return { parser, query }
}

function doInit(): Promise<Record<DslLangId, LangRuntime>> {
  return Parser.init({ locateFile: () => `${WASM_BASE}/web-tree-sitter.wasm` }).then(async () => {
    const [description, behavior] = await Promise.all([
      buildRuntime("tree-sitter-description.wasm", "highlights-description.scm"),
      buildRuntime("tree-sitter-behavior.wasm", "highlights-behavior.scm")
    ])
    return { description, behavior }
  })
}

function getRuntimes(): Promise<Record<DslLangId, LangRuntime>> {
  if (!initPromise) initPromise = doInit()
  return initPromise
}

/**
 * Tokenizes `text` as `.description` or `.behavior` DSL source into a flat
 * list of spans covering the whole input. When two query patterns capture
 * the exact same node range, the later pattern in highlights.scm wins,
 * matching tree-sitter's own "last matching pattern takes precedence" rule.
 */
export async function highlightDsl(langId: DslLangId, text: string): Promise<DslToken[]> {
  const runtimes = await getRuntimes()
  const { parser, query } = runtimes[langId]
  const tree: Tree | null = parser.parse(text)
  if (!tree) return [{ text }]

  // Sort by patternIndex first so that, when two patterns capture the exact
  // same node range (e.g. a generic `@type` pattern and a more specific
  // `@namespace` pattern below it), the later-declared pattern's name wins
  // in the Map regardless of the incidental order captures() returns.
  const captures = [...query.captures(tree.rootNode)].sort((a, b) => a.patternIndex - b.patternIndex)
  const byRange = new Map<string, string>()
  for (const capture of captures) {
    byRange.set(`${capture.node.startIndex}-${capture.node.endIndex}`, capture.name)
  }

  const ranges = Array.from(byRange.entries())
    .map(([key, name]) => {
      const [start, end] = key.split("-").map(Number)
      return { start, end, name }
    })
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const tokens: DslToken[] = []
  let cursor = 0
  for (const { start, end, name } of ranges) {
    if (start < cursor) continue // nested/overlapping sub-range of an already-emitted token
    if (start > cursor) tokens.push({ text: text.slice(cursor, start) })
    tokens.push({ text: text.slice(start, end), className: CAPTURE_STYLES[name] })
    cursor = end
  }
  if (cursor < text.length) tokens.push({ text: text.slice(cursor) })

  return tokens
}
