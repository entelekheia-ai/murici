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
import { buildAppMenu, MenuAction } from "./menu"
import { resolveInitialLocale } from "./menu-i18n"
import { getAppConfigLocale, saveAppConfigLocale } from "./app-config"

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
    ...(isDev
      ? [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.simple()
            )
          })
        ]
      : [])
  ]
})

for (const method of ["log", "warn", "error"] as const) {
  const original = console[method].bind(console)
  console[method] = (...args: any[]) => {
    // Only output to native console if not in Dev via Winston (to avoid double logging)
    // Actually Winston console transport will handle stdout in dev.
    const line = args
      .map(a =>
        a instanceof Error
          ? (a.stack ?? a.message)
          : typeof a === "string"
            ? a
            : JSON.stringify(a)
      )
      .join(" ")

    if (method === "log") logger.info(line)
    else if (method === "warn") logger.warn(line)
    else if (method === "error") logger.error(line)
  }
}

console.log(
  `Murici starting — version ${app.getVersion()}, log file: ${logFile}`
)

let mainWindow: BrowserWindow | null = null
let serverPort = 3000
let fileToOpen: string | null = null

// Main's whole job with a .agent is to hand over its BYTES. It deliberately does NOT
// unpack: the renderer POSTs them to /api/agent/unpack, which is the app's single
// unpack (lib/agents/unpack-agent-file.ts).
//
// Main used to run its own loadAgent() and build the UnpackPayload by hand — a second
// copy of a mapping that already existed on the web side, and it had silently gone
// stale: it dropped `knowledge` and `guides`, so every agent opened through Electron
// lost its knowledge files. Reading a filesystem path is the only part the renderer
// genuinely can't do; everything else belongs on one side of the wire, not two.
async function readAgentFile(filePath: string): Promise<Buffer> {
  if (!filePath.endsWith(".agent"))
    throw new Error("File must have .agent extension")
  return readFile(filePath)
}

// The persisted choice (if any) wins over guessing from the OS locale — it
// reflects what the user actually picked last time, including on a system
// whose OS language doesn't match one of our shipped locales.
let menuLocale = getAppConfigLocale() ?? resolveInitialLocale(app.getLocale())
let menuDebugMode = false
let menuShowChatList = false
let menuShowDetails = false

function rebuildMenu(): void {
  buildAppMenu(
    {
      locale: menuLocale,
      debugMode: menuDebugMode,
      showChatList: menuShowChatList,
      showDetails: menuShowDetails
    },
    { onAction: handleMenuAction, onLoadAgent: handleLoadAgent }
  )
}

function handleMenuAction(action: MenuAction): void {
  mainWindow?.webContents.send("murici:menu-action", { action })
}

async function handleLoadAgent(): Promise<void> {
  if (!mainWindow) return
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Agent File", extensions: ["agent"] }]
  })
  if (result.canceled || result.filePaths.length === 0) return

  // Just the path: the renderer reads the bytes back through read-agent-file and
  // unpacks them itself.
  mainWindow.webContents.send("open-agent-file", {
    filePath: result.filePaths[0]
  })
}

ipcMain.on("murici:debug-mode-changed", (_event, value: boolean) => {
  menuDebugMode = value
  rebuildMenu()
})

ipcMain.on("murici:locale-changed", (_event, locale: string) => {
  menuLocale = locale
  saveAppConfigLocale(locale)
  rebuildMenu()
})

ipcMain.on(
  "murici:sidebar-state-changed",
  (_event, state: { showSidebar?: boolean; showRightSidebar?: boolean }) => {
    if (state.showSidebar !== undefined) menuShowChatList = state.showSidebar
    if (state.showRightSidebar !== undefined)
      menuShowDetails = state.showRightSidebar
    rebuildMenu()
  }
)

// Handle file open from OS (macOS)
app.on("open-file", (event, filePath) => {
  event.preventDefault()
  if (filePath.endsWith(".agent")) {
    fileToOpen = filePath
    if (mainWindow) {
      mainWindow.webContents.send("open-agent-file", { filePath })
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

ipcMain.on("app-ready-for-files", () => {
  if (fileToOpen) {
    mainWindow?.webContents.send("open-agent-file", { filePath: fileToOpen })
    fileToOpen = null
  }
})

ipcMain.handle("read-agent-file", (_event, filePath: string) =>
  readAgentFile(filePath)
)

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 430,
    minHeight: 430,
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

  // A summary error like ERR_TOO_MANY_REDIRECTS doesn't say which URLs were
  // actually chained, and the app-level "Toggle Dev Tools" menu item can't
  // help either (it's gated behind debugMode, which the renderer only
  // reports once it has loaded — no use when it never does). This hook is
  // cheap in steady state — a correctly-built URL now redirects at most
  // once, if ever — so it stays on permanently as a diagnostic breadcrumb.
  mainWindow.webContents.session.webRequest.onBeforeRedirect(
    { urls: ["http://localhost/*", "http://127.0.0.1/*"] },
    details => {
      logger.info(
        `[net] redirect ${details.statusCode} ${details.url} -> ${details.redirectURL}`
      )
    }
  )

  // Load the fully-resolved locale-prefixed workspace URL directly (rather
  // than bare "/") — skips both the server's one-time locale-detection
  // redirect and the client-side root page's own redirect, so first paint
  // needs zero round-trips through next-i18n-router's middleware at all.
  mainWindow.loadURL(`http://localhost:${serverPort}/${menuLocale}/local/chat`)

  mainWindow.once("ready-to-show", () => {
    mainWindow!.show()
  })

  // Main-process console.* only covers startup/IPC — the app's actual
  // activity happens in the renderer (Next.js/React UI). Bridge it into
  // the same log file so main.log reflects real usage, not just launches.
  mainWindow.webContents.on("console-message", details => {
    const line = `[renderer] ${details.message} (${details.sourceId}:${details.lineNumber})`
    if (details.level === "error") logger.error(line)
    else if (details.level === "warning") logger.warn(line)
    else logger.info(line)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })

  mainWindow.on("closed", () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  try {
    app.setAboutPanelOptions({
      applicationName: "Murici",
      applicationVersion: app.getVersion(),
      copyright: "Copyright © 2026 Danilo Borges / Entelékheia Labs",
      website: "https://entelekheia.ai"
    })

    if (!isDev) serverPort = await startNextServer()
    await createWindow()
    rebuildMenu()
    if (!isDev) setupAutoUpdater(() => menuLocale)

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

app.on("before-quit", () => {
  stopNextServer()
})
