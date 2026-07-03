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
 * Packs every .agent package under agents/ into public/agents/<name>.agent,
 * using the same pack() the dot-agent CLI calls. Run after editing any
 * .behavior/.description/knowledge file so the bundled copy stays in sync —
 * nothing else does this automatically today.
 */

const fs = require("fs")
const path = require("path")
const { pack } = require("@dot-agent/compiler")

const ROOT = path.resolve(__dirname, "..")
const AGENTS_DIR = path.join(ROOT, "agents")
const OUT_DIR = path.join(ROOT, "public", "agents")

async function main() {
  if (!fs.existsSync(AGENTS_DIR)) {
    console.warn(`[build-agents] no agents/ directory at ${AGENTS_DIR}`)
    return
  }

  const entries = fs.readdirSync(AGENTS_DIR, { withFileTypes: true })
  const packageDirs = entries
    .filter(e => e.isDirectory())
    .map(e => path.join(AGENTS_DIR, e.name))
    .filter(dir => fs.readdirSync(dir).some(f => f.endsWith(".description")))

  if (packageDirs.length === 0) {
    console.warn(`[build-agents] no *.description packages found under ${AGENTS_DIR}`)
    return
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })

  let failures = 0
  for (const dir of packageDirs) {
    // agents/onboarding-agent/ -> public/agents/onboarding.agent, matching
    // the short names already hardcoded at call sites (e.g. "/agents/memory.agent").
    const name = path.basename(dir).replace(/-agent$/, "")
    const out = path.join(OUT_DIR, `${name}.agent`)
    try {
      const result = await pack({ dir, out })
      for (const w of result.warnings) {
        console.warn(`  ⚠ ${w.file}:${w.line}:${w.col} ${w.code} ${w.message}`)
      }
      console.log(`[build-agents] ✓ ${name} → public/agents/${name}.agent (${result.id})`)
    } catch (err) {
      failures++
      console.error(`[build-agents] ✗ ${name} failed:`, err.message || err)
    }
  }

  if (failures > 0) {
    process.exitCode = 1
  }
}

main()
