// SPDX-License-Identifier: Apache-2.0

// Replace the exact @dot-agent/* pins with what the registry serves under a dist-tag, so the test
// suite runs against the published artifact a future bump would bring in. Throwaway checkouts only
// (CI): it installs with --no-save, and prints the versions it resolved as the proof.
//
//   node scripts/canary-install.mjs --channel latest|beta|alpha

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const i = process.argv.indexOf("--channel")
const channel = i > 0 ? process.argv[i + 1] : "latest"
if (!["latest", "beta", "alpha"].includes(channel)) {
  console.error(`unknown channel: ${channel}`)
  process.exit(2)
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"))
const deps = { ...pkg.dependencies, ...pkg.devDependencies }
const names = Object.keys(deps).filter(n => n.startsWith("@dot-agent/"))

execFileSync(
  "npm",
  ["install", "--no-save", "--ignore-scripts", ...names.map(n => `${n}@${channel}`)],
  { stdio: "inherit" }
)

// Read the manifest from disk: the packages' `exports` do not expose ./package.json to require().
for (const n of names) {
  const installed = JSON.parse(readFileSync(`node_modules/${n}/package.json`, "utf8")).version
  console.log(`${n}: pinned ${deps[n]} -> ${channel} ${installed}`)
}
