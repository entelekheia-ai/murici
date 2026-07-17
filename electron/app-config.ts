/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import * as fs from "fs"
import * as path from "path"
import * as os from "os"

// General app-level config, read/written directly by the main process (this
// is a local, single-user app — no IPC round-trip needed). Distinct from
// mcp.json (lib/mcp/config-store.ts), which is scoped to MCP server
// definitions; started with just `locale`, kept general-purpose so other
// app-level settings can land here later. Deliberately self-contained (not
// imported from lib/) — the main process has no Next.js/React context, same
// reasoning as menu-i18n.ts reading translation JSON straight off disk
// instead of going through lib/i18n.ts.
//
// This persists the locale so the native menu and updater dialog can start
// in the right language on the *next* launch, without waiting for the
// renderer to load and report its resolved locale over IPC — useful in
// general, and load-bearing when the renderer fails to load at all.
const CONFIG_DIR = path.join(os.homedir(), ".config", "murici")
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json")

interface AppConfig {
  locale?: string
}

function readConfig(): AppConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as AppConfig
  } catch {
    return {}
  }
}

export function getAppConfigLocale(): string | undefined {
  return readConfig().locale
}

export function saveAppConfigLocale(locale: string): void {
  try {
    if (!fs.existsSync(CONFIG_DIR))
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    const merged = { ...readConfig(), locale }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), "utf8")
  } catch (error) {
    console.error("Failed to save app config:", error)
  }
}
