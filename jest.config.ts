/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import type { Config } from "jest"
import nextJest from "next/jest.js"

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: "./"
})

// Add any custom config to be passed to Jest
const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/jest.setup.ts"],
  // Playwright specs (run via `npm run test:e2e`, not Jest) use `@playwright/test`'s
  // own `test()` — importing that runner outside its CLI breaks in confusing ways.
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/__tests__/playwright-test/"]
}

// next/jest merges its own `transformIgnorePatterns` (which always includes
// a blanket `/node_modules/`) ahead of whatever we pass in `config` above —
// since Jest ignores a path if ANY pattern matches, that blanket entry wins
// regardless of what we add. The Vercel AI SDK ships ESM-only builds with a
// deep transitive ESM dependency chain (`ai` -> `@ai-sdk/gateway` ->
// `@workflow/serde`, etc.), so carving out exceptions package-by-package is
// whack-a-mole. Instead, drop the blanket node_modules ignore entirely (keep
// only next/jest's CSS-module pattern) so SWC transforms whatever actually
// gets required — it's fast enough and only touches modules under test.
export default async () => {
  const nextJestConfig = await createJestConfig(config)()
  return {
    ...nextJestConfig,
    transformIgnorePatterns: ["^.+\\.module\\.(css|sass|scss)$"]
  }
}
