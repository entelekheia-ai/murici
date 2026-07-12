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

/**
 * Unified Logger Wrapper
 * Provides an agnostic interface that maps to Winston on the server/electron
 * and console/fetch on the client.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 } as const
type Level = keyof typeof LEVELS

class UniversalLogger {
  // `typeof window === "undefined"` alone is not reliable: some libraries
  // set a window-like polyfill object on globalThis as a side effect of
  // being imported in a non-browser environment (observed under Jest with
  // certain module combinations), without it having a real `document`. A
  // real browser/jsdom window always has `.document`.
  private isServer = typeof window === "undefined" || typeof window.document === "undefined"

  // debug is off by default (both server and client) — it's meant to be
  // turned on ad hoc while investigating something (NEXT_PUBLIC_LOG_LEVEL is
  // inlined at build time by Next.js, so it works in both environments,
  // unlike a server-only LOG_LEVEL var), not left permanently noisy.
  private currentLevel: Level =
    (typeof process !== "undefined" &&
      (process.env.NEXT_PUBLIC_LOG_LEVEL as Level)) ||
    "info"

  info(message: string, meta?: Record<string, any>) {
    this._log("info", message, meta)
  }

  warn(message: string, meta?: Record<string, any>) {
    this._log("warn", message, meta)
  }

  error(message: string, meta?: Record<string, any>) {
    this._log("error", message, meta)
  }

  debug(message: string, meta?: Record<string, any>) {
    this._log("debug", message, meta)
  }

  trace(message: string, meta?: Record<string, any>) {
    this._log("trace", message, meta)
  }

  private _log(level: Level, message: string, meta?: Record<string, any>) {
    if (LEVELS[level] > LEVELS[this.currentLevel]) return

    if (this.isServer) {
      // On the server, we rely on the global console which is intercepted by winston in main.ts
      // or we can import winston directly if we are in Next.js.
      // For now, since electron/main.ts intercepts console methods, 
      // standard console methods are written to main.log.
      const payload = meta ? `${message} ${JSON.stringify(meta)}` : message
      switch (level) {
        case "info":
        case "debug":
        case "trace":
          console.log(`[${level.toUpperCase()}] ${payload}`)
          break
        case "warn":
          console.warn(`[WARN] ${payload}`)
          break
        case "error":
          console.error(`[ERROR] ${payload}`)
          break
      }
    } else {
      // On the client, mirror to the console as before, and also forward
      // errors to /api/errors/client so they land in the same Winston
      // pipeline as server-side errors (see that route for why).
      if (level === "error") {
        console.error(message, meta || "")
        this._reportToServer(message, meta)
      } else if (level === "warn") {
        console.warn(message, meta || "")
      } else {
        console.log(`[${level.toUpperCase()}]`, message, meta || "")
      }
    }
  }

  private _reportToServer(message: string, meta?: Record<string, any>) {
    if (typeof fetch !== "function") return
    try {
      fetch("/api/errors/client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          ...meta,
          source: meta?.source || "logger.error",
          url: window.location.href
        }),
        keepalive: true
      }).catch(() => {
        // Best-effort only — never let error reporting itself throw.
      })
    } catch {
      // fetch() itself can throw synchronously in some environments.
    }
  }
}

export const logger = new UniversalLogger()
