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

import { app, BrowserWindow, shell, ipcMain, dialog } from "electron"
import * as path from "path"
import * as fs from "fs"
import { startNextServer, stopNextServer } from "./next-server"
import { setupAutoUpdater } from "./updater"
import { readFile } from "fs/promises"
import type { UnpackPayload } from "../types/electron"

const isDev =
  process.env.NODE_ENV === "development" ||
  process.env.ELECTRON_ENV === "development" ||
  !app.isPackaged

// A packaged app launched from Finder/Dock has no attached terminal, so
// to a file under the OS logs dir so a silent startup failure (e.g. the
// bundled Next.js server failing to boot) is still diagnosable.
import * as winston from "winston"

const logFile = path.join(app.getPath("logs"), "main.log")
fs.mkdirSync(path.dirname(logFile), { recursive: true })

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] [${level.toUpperCase()}] ${message}`
    })
  ),
  transports: [
    new winston.transports.File({ filename: logFile }),
    // In dev, Next.js output and console.log is very spammy, but we keep it
    ...(isDev ? [new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })] : [])
  ]
})

for (const method of ["log", "warn", "error"] as const) {
  const original = console[method].bind(console)
  console[method] = (...args: any[]) => {
    // Only output to native console if not in Dev via Winston (to avoid double logging)
    // Actually Winston console transport will handle stdout in dev.
    const line = args
      .map(a => (a instanceof Error ? (a.stack ?? a.message) : typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ")
    
    if (method === "log") logger.info(line)
    else if (method === "warn") logger.warn(line)
    else if (method === "error") logger.error(line)
  }
}

console.log(`Murici starting — version ${app.getVersion()}, log file: ${logFile}`)

let mainWindow: BrowserWindow | null = null
let serverPort = 3000
let fileToOpen: string | null = null

// SDK is ESM-only; use new Function to force a real ESM import() at runtime,
// bypassing TypeScript's compilation of dynamic import() to require() in CJS output.
let sdk: typeof import("@dot-agent/sdk") | null = null
async function getSDK() {
  if (!sdk) sdk = await (new Function("s", "return import(s)") as (s: string) => Promise<typeof import("@dot-agent/sdk")>)("@dot-agent/sdk")
  return sdk
}

async function resolveAgentFile(filePath: string): Promise<UnpackPayload> {
  const { loadAgent } = await getSDK()
  const bytes = await readFile(filePath)
  const bundle = await loadAgent(bytes)
  const am = bundle.aboutme
  const files = bundle.files
  return {
    aboutme: {
      id: am.id,
      name: am.name,
      version: am.version,
      domain: am.domain,
      description: am.description,
      persona: files.persona,
      license: am.license
    },
    behaviorText: files.behavior,
    descriptionText: files.description,
    behaviors: files.behaviors ?? []
  }
}

// Handle file open from OS (macOS)
app.on("open-file", (event, filePath) => {
  event.preventDefault()
  if (filePath.endsWith(".agent")) {
    fileToOpen = filePath
    if (mainWindow) {
      resolveAgentFile(filePath)
        .then(payload => { mainWindow!.webContents.send("open-agent-file", { payload, filePath }) })
        .catch(err => {
          console.error("Failed to resolve agent file:", err)
          mainWindow!.webContents.send("open-agent-file-error", err.message || err.toString())
        })
      fileToOpen = null
    } else if (app.isReady()) {
      createWindow()
    }
  }
})

// Handle file open from command line (Windows/Linux/macOS terminal)
if (process.argv.length >= 2) {
  const filePath = process.argv[process.argv.length - 1]
  if (filePath.endsWith(".agent")) fileToOpen = filePath
}

ipcMain.on("app-ready-for-files", (event) => {
  if (fileToOpen) {
    // Capture before resolveAgentFile's promise settles: fileToOpen is nulled
    // synchronously right after this call kicks off, well before the async
    // readFile/loadAgent work finishes, so the .then() below can't read the
    // module-level variable directly without racing that reset.
    const resolvedPath = fileToOpen
    resolveAgentFile(resolvedPath)
      .then(payload => {
        mainWindow?.webContents.send("open-agent-file", { payload, filePath: resolvedPath })
      })
      .catch(err => {
        console.error("Failed to resolve agent file:", err)
        mainWindow?.webContents.send("open-agent-file-error", err.message || err.toString())
      })
    fileToOpen = null
  }
})

ipcMain.handle("resolve-agent-file", (_event, filePath: string) =>
  resolveAgentFile(filePath)
)

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hidden",
    ...(process.platform === "darwin" && {
      trafficLightPosition: { x: 16, y: 13 }
    }),
    show: false,
    icon: path.join(__dirname, "../icon/Murici-liquid-glass@2x.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.loadURL(`http://localhost:${serverPort}`)

  mainWindow.once("ready-to-show", () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })

  mainWindow.on("closed", () => { mainWindow = null })
}

app.whenReady().then(async () => {
  try {
    if (!isDev) serverPort = await startNextServer()
    await createWindow()
    if (!isDev) setupAutoUpdater()

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  } catch (err: any) {
    console.error("Fatal startup error, no window was created:", err)
    dialog.showErrorBox(
      "Murici failed to start",
      `${err?.message ?? err}\n\nLog file: ${logFile}`
    )
    app.quit()
  }
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    stopNextServer()
    app.quit()
  }
})

app.on("before-quit", () => { stopNextServer() })
