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

import { contextBridge, ipcRenderer, webUtils } from "electron"
import type { OsPendingAgentFile } from "../types/electron"

let openAgentFileCallback: ((data: OsPendingAgentFile) => void) | null = null
let menuActionCallback: ((data: { action: string }) => void) | null = null

ipcRenderer.on("open-agent-file", (_event, data) => {
  if (openAgentFileCallback) {
    openAgentFileCallback(data)
  }
})

ipcRenderer.on("murici:menu-action", (_event, data) => {
  if (menuActionCallback) {
    menuActionCallback(data)
  }
})

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome
  },
  onOpenAgentFile: (cb: (data: OsPendingAgentFile) => void) => {
    openAgentFileCallback = cb
  },
  appReadyForFiles: () => {
    ipcRenderer.send("app-ready-for-files")
  },
  // The renderer cannot read an arbitrary filesystem path, so main hands over the
  // bytes and the renderer unpacks them through /api/agent/unpack — the app's single
  // unpack. Main deliberately does NOT return a parsed payload: a second unpack in a
  // second process is exactly what drifted and silently dropped `knowledge`.
  readAgentFile: async (filePath: string): Promise<Uint8Array> =>
    new Uint8Array(await ipcRenderer.invoke("read-agent-file", filePath)),
  // File.path was removed from renderer File objects in Electron 32+; this is
  // the replacement (see agent-session-provider.tsx handleAgentFile).
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  onMenuAction: (cb: (data: { action: string }) => void) => {
    menuActionCallback = cb
  },
  setDebugMode: (value: boolean) => {
    ipcRenderer.send("murici:debug-mode-changed", value)
  },
  setLocale: (locale: string) => {
    ipcRenderer.send("murici:locale-changed", locale)
  },
  setSidebarState: (state: { showSidebar?: boolean; showRightSidebar?: boolean }) => {
    ipcRenderer.send("murici:sidebar-state-changed", state)
  }
})
