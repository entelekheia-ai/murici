/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
 * Copies the tree-sitter runtime + DSL grammars into public/tree-sitter so the
 * browser can fetch() them by URL. web-tree-sitter's Language.load()/Parser.init()
 * expect a fetchable path, not a node_modules filesystem path.
 */

const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..")
const OUT_DIR = path.join(ROOT, "public", "tree-sitter")

const FILES = [
  {
    from: path.join(ROOT, "node_modules", "web-tree-sitter", "web-tree-sitter.wasm"),
    to: path.join(OUT_DIR, "web-tree-sitter.wasm")
  },
  {
    from: path.join(ROOT, "node_modules", "@dot-agent", "tree-sitter", "dist", "tree-sitter-description.wasm"),
    to: path.join(OUT_DIR, "tree-sitter-description.wasm")
  },
  {
    from: path.join(ROOT, "node_modules", "@dot-agent", "tree-sitter", "dist", "tree-sitter-behavior.wasm"),
    to: path.join(OUT_DIR, "tree-sitter-behavior.wasm")
  },
  {
    from: path.join(ROOT, "node_modules", "@dot-agent", "tree-sitter", "tree-sitter-description", "queries", "highlights.scm"),
    to: path.join(OUT_DIR, "highlights-description.scm")
  },
  {
    from: path.join(ROOT, "node_modules", "@dot-agent", "tree-sitter", "tree-sitter-behavior", "queries", "highlights.scm"),
    to: path.join(OUT_DIR, "highlights-behavior.scm")
  }
]

fs.mkdirSync(OUT_DIR, { recursive: true })

let missing = 0
for (const { from, to } of FILES) {
  if (!fs.existsSync(from)) {
    console.warn(`[copy-tree-sitter-assets] missing source: ${from}`)
    missing++
    continue
  }
  fs.copyFileSync(from, to)
}

if (missing > 0) {
  console.warn(
    `[copy-tree-sitter-assets] ${missing} file(s) missing — DSL syntax highlighting will be unavailable until 'npm install' resolves @dot-agent/tree-sitter and web-tree-sitter.`
  )
} else {
  console.log(`[copy-tree-sitter-assets] copied ${FILES.length} files to public/tree-sitter/`)
}
