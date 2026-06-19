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
import { startNextServer, stopNextServer } from "./next-server"
import { setupAutoUpdater } from "./updater"
import { readFile } from "fs/promises"
import type { AgentSession, AgentBundle } from "@dot-agent/sdk"
import type { UnpackPayload, KernelState } from "../types/electron"
import type { Effect } from "../types/kernel-effect"

const isDev =
  process.env.NODE_ENV === "development" ||
  process.env.ELECTRON_ENV === "development" ||
  !app.isPackaged

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

const EFFECT_TYPES = [
  "goal", "guide", "teach", "request_interact", "transition",
  "run_tool", "run_script", "run_subagent", "set_memory",
  "apply_css", "remove_css", "apply_html", "remove_html",
  "apply_video", "remove_video", "parse_error"
]

interface AgentEntry {
  session: AgentSession
  sink: { current: Effect[] }
}

let agentEntry: AgentEntry | null = null

function wireHandlers(session: AgentSession): { current: Effect[] } {
  const sink: { current: Effect[] } = { current: [] }
  for (const type of EFFECT_TYPES) {
    if (type === "set_memory") {
      session.registerHandler(type, (e: any) => {
        sink.current.push(e as Effect)
        session.injectMemory(e.domain, e.key, String(e.value ?? ""))
      })
    } else {
      session.registerHandler(type, (e) => { sink.current.push(e as Effect) })
    }
  }
  return sink
}

function buildKernelState(session: AgentSession, effects: Effect[]): KernelState {
  const state = session.getState()
  const scxml = session.getGraph()
  const graph = scxml && scxml.length > 0 ? scxml : null
  const validIntents = Array.from(session.getValidIntents() || []) as string[]
  return { currentState: state, graph, validIntents, effects }
}

function resolveMerges(
  behaviorContent: string,
  behaviors: Array<{ path: string; content: string }>
): string {
  if (behaviors.length === 0) return behaviorContent
  const behaviorMap = new Map(behaviors.map(b => [b.path, b.content]))
  const lines = behaviorContent.split("\n")
  const result: string[] = []
  let inPreamble = true
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("state ")) inPreamble = false
    if (inPreamble && trimmed.startsWith('merge "')) {
      const match = trimmed.match(/^merge\s+"([^"]+)"/)
      if (match) {
        const merged = behaviorMap.get(match[1])
        result.push(merged ?? line)
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
  const { loadAgent } = await getSDK()
  const bytes = await readFile(filePath)
  const bundle = await loadAgent(bytes)
  const behaviorText = resolveMerges(bundle.files.behavior, bundle.files.behaviors)
  const am = bundle.aboutme
  return {
    aboutme: {
      id: am.id,
      name: am.name,
      version: am.version,
      domain: am.domain,
      description: am.description,
      persona: am.persona,
      license: am.license
    },
    behaviorText
  }
}

// Handle file open from OS (macOS)
app.on("open-file", (event, filePath) => {
  event.preventDefault()
  if (filePath.endsWith(".agent")) {
    if (mainWindow) {
      resolveAgentFile(filePath)
        .then(payload => { mainWindow!.webContents.send("open-agent-file", payload) })
        .catch(err => { console.error("Failed to resolve agent file:", err) })
    } else {
      fileToOpen = filePath
    }
  }
})

// Handle file open from command line (Windows/Linux)
if (process.platform !== "darwin" && process.argv.length >= 2) {
  const filePath = process.argv[process.argv.length - 1]
  if (filePath.endsWith(".agent")) fileToOpen = filePath
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    ...(process.platform === "darwin" && {
      trafficLightPosition: { x: 12, y: 18 }
    }),
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
        .then(payload => { mainWindow!.webContents.send("open-agent-file", payload) })
        .catch(err => { console.error("Failed to resolve agent file:", err) })
      fileToOpen = null
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })

  mainWindow.on("closed", () => { mainWindow = null })
}

app.whenReady().then(async () => {
  ipcMain.handle("kernel:load", async (_, text: string) => {
    try {
      agentEntry?.session.dispose()
      agentEntry = null

      const { AgentSession } = await getSDK()
      const bundle = {
        id: "electron-session",
        aboutme: {} as any,
        files: { description: "", behavior: text, guides: [], knowledge: [], behaviors: [] }
      } as AgentBundle

      const session = await AgentSession.create(bundle)
      const sink = wireHandlers(session)
      sink.current = []
      session.start()
      agentEntry = { session, sink }
      return buildKernelState(session, sink.current)
    } catch (err: any) {
      throw new Error(err?.message || "Failed to load behavior")
    }
  })

  ipcMain.handle("kernel:intent", async (_, intent: string) => {
    try {
      if (!agentEntry) throw new Error("No active agent session")
      agentEntry.sink.current = []
      agentEntry.session.sendIntent(intent)
      return buildKernelState(agentEntry.session, agentEntry.sink.current)
    } catch (err: any) {
      throw new Error(err?.message || "Failed to send intent")
    }
  })

  ipcMain.handle("kernel:offtopic", async () => {
    try {
      if (!agentEntry) throw new Error("No active agent session")
      agentEntry.sink.current = []
      agentEntry.session.sendOfftopic()
      return buildKernelState(agentEntry.session, agentEntry.sink.current)
    } catch (err: any) {
      throw new Error(err?.message || "Failed to send offtopic")
    }
  })

  ipcMain.handle("kernel:tick", async () => {
    try {
      if (!agentEntry) throw new Error("No active agent session")
      agentEntry.sink.current = []
      agentEntry.session.tickPrompt()
      return { effects: agentEntry.sink.current }
    } catch (err: any) {
      throw new Error(err?.message || "Failed to tick prompt")
    }
  })

  if (!isDev) serverPort = await startNextServer()
  await createWindow()
  if (!isDev) setupAutoUpdater()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    stopNextServer()
    app.quit()
  }
})

app.on("before-quit", () => { stopNextServer() })
