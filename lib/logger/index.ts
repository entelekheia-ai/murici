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

class UniversalLogger {
  private isServer = typeof window === "undefined"

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

  private _log(level: string, message: string, meta?: Record<string, any>) {
    if (this.isServer) {
      // On the server, we rely on the global console which is intercepted by winston in main.ts
      // or we can import winston directly if we are in Next.js.
      // For now, since electron/main.ts intercepts console methods, 
      // standard console methods are written to main.log.
      const payload = meta ? `${message} ${JSON.stringify(meta)}` : message
      switch (level) {
        case "info":
        case "debug":
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
      // On the client, we can dispatch to the backend (via API or IPC) if needed,
      // or just console log.
      if (level === "error") {
        console.error(message, meta || "")
      } else if (level === "warn") {
        console.warn(message, meta || "")
      } else {
        console.log(`[${level.toUpperCase()}]`, message, meta || "")
      }
    }
  }
}

export const logger = new UniversalLogger()
