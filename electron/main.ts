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

import { app, BrowserWindow, shell, ipcMain } from "electron"
import * as path from "path"
import { fileURLToPath } from "url"
import { startNextServer, stopNextServer } from "./next-server.js"
import { setupAutoUpdater } from "./updater.js"
import { unpack } from "@dot-agent/cli"
import { readFile, rm, mkdtemp } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import type { UnpackPayload, KernelState } from "../types/electron"
import type { Effect } from "../types/kernel-effect"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev =
  process.env.NODE_ENV === "development" ||
  process.env.ELECTRON_ENV === "development" ||
  !app.isPackaged

let mainWindow: BrowserWindow | null = null
let serverPort = 3000
let fileToOpen: string | null = null

let kernel: any = null
let kernelInitialized = false

async function getKernel(): Promise<any> {
  if (!kernelInitialized) {
    const kernelModule = await import("@dot-agent/kernel-dsl") as any
    await kernelModule.init()
    kernelInitialized = true
  }
  if (!kernel) {
    const kernelModule = await import("@dot-agent/kernel-dsl") as any
    kernel = new kernelModule.AgentDSLKernel()
  }
  return kernel
}

function buildKernelState(eng: any, effects: Effect[]): KernelState {
  const state = eng.get_current_state()
  const graph = eng.get_graph()
  const validIntents = Array.from(eng.get_valid_intents() || []) as string[]
  const hasOfftopic =
    graph?.transitions?.some(
      (t: any) => t.from === state && t.label === "offtopic"
    ) ?? false

  return {
    currentState: state,
    graph,
    validIntents,
    hasOfftopic,
    effects
  }
}

async function resolveMerges(
  behaviorContent: string,
  outDir: string
): Promise<string> {
  const lines = behaviorContent.split("\n")
  const result: string[] = []
  let inPreamble = true

  for (const line of lines) {
    const trimmed = line.trim()

    // Stop preamble when we hit first state declaration
    if (trimmed.startsWith("state ")) {
      inPreamble = false
    }

    if (inPreamble && trimmed.startsWith('merge "')) {
      // Extract merge path: merge "behaviors/planning.flow" -> behaviors/planning.flow
      const match = trimmed.match(/^merge\s+"([^"]+)"/)
      if (match) {
        const mergePath = match[1]
        const fullPath = join(outDir, mergePath)

        try {
          const mergedContent = await readFile(fullPath, "utf-8")
          // Inline the merged content
          result.push(mergedContent)
        } catch (e) {
          console.error(`Failed to read merge file: ${mergePath}`, e)
          result.push(line)
        }
      } else {
        result.push(line)
      }
    } else {
      result.push(line)
    }
  }

  return result.join("\n")
}

async function resolveAgentFile(filePath: string): Promise<UnpackPayload> {
  const tmpDir = await mkdtemp(join(tmpdir(), "agent-"))

  try {
    const unpackResult = await unpack({
      file: filePath,
      out: join(tmpDir, "unpacked"),
      force: true
    })

    // Read agent.behavior
    const behaviorPath = join(tmpDir, "unpacked", "agent.behavior")
    let behaviorContent = await readFile(behaviorPath, "utf-8")

    // Resolve merge directives
    behaviorContent = await resolveMerges(
      behaviorContent,
      join(tmpDir, "unpacked")
    )

    // Extract aboutme from unpack result
    const aboutme = unpackResult.aboutme
    return {
      aboutme: {
        id: aboutme.id,
        name: aboutme.name,
        version: aboutme.version,
        domain: aboutme.domain,
        description: aboutme.description,
        persona: aboutme.persona,
        license: aboutme.license
      },
      behaviorText: behaviorContent
    }
  } finally {
    // Clean up temp files
    try {
      await rm(tmpDir, { recursive: true, force: true })
    } catch (e) {
      console.error("Failed to clean up temp files:", e)
    }
  }
}

// Handle file open from OS (macOS)
app.on("open-file", (event, filePath) => {
  event.preventDefault()
  if (filePath.endsWith(".agent")) {
    if (mainWindow) {
      resolveAgentFile(filePath)
        .then(payload => {
          mainWindow!.webContents.send("open-agent-file", payload)
        })
        .catch(err => {
          console.error("Failed to resolve agent file:", err)
        })
    } else {
      fileToOpen = filePath
    }
  }
})

// Handle file open from command line (Windows/Linux)
if (process.platform !== "darwin" && process.argv.length >= 2) {
  const filePath = process.argv[process.argv.length - 1]
  if (filePath.endsWith(".agent")) {
    fileToOpen = filePath
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "default",
    show: false,
    icon: path.join(__dirname, "../icon/Murici@2x.png"),
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

    if (fileToOpen) {
      resolveAgentFile(fileToOpen)
        .then(payload => {
          mainWindow!.webContents.send("open-agent-file", payload)
        })
        .catch(err => {
          console.error("Failed to resolve agent file:", err)
        })
      fileToOpen = null
    }
  })

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })

  mainWindow.on("closed", () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  // Setup IPC handlers for kernel
  ipcMain.handle("kernel:load", async (_, text: string) => {
    try {
      kernel = null
      const k = await getKernel()
      const effects = k.load_behavior(text)
      return buildKernelState(k, effects)
    } catch (err: any) {
      throw new Error(err?.message || "Failed to load behavior")
    }
  })

  ipcMain.handle("kernel:intent", async (_, intent: string) => {
    try {
      const k = await getKernel()
      const effects = k.send_intent(intent)
      return buildKernelState(k, effects)
    } catch (err: any) {
      throw new Error(err?.message || "Failed to send intent")
    }
  })

  ipcMain.handle("kernel:offtopic", async () => {
    try {
      const k = await getKernel()
      const effects = k.send_offtopic()
      return buildKernelState(k, effects)
    } catch (err: any) {
      throw new Error(err?.message || "Failed to send offtopic")
    }
  })

  ipcMain.handle("kernel:tick", async () => {
    try {
      const k = await getKernel()
      const effects = k.tick_prompt()
      return { effects }
    } catch (err: any) {
      throw new Error(err?.message || "Failed to tick prompt")
    }
  })

  if (!isDev) {
    serverPort = await startNextServer()
  }

  await createWindow()

  if (!isDev) {
    setupAutoUpdater()
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
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
