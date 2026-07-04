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

import { contextBridge, ipcRenderer } from "electron"
import type { OsPendingAgentFile, UnpackPayload } from "../types/electron"

let openAgentFileCallback: ((data: OsPendingAgentFile) => void) | null = null
let openAgentFileErrorCallback: ((errorMsg: string) => void) | null = null

ipcRenderer.on("open-agent-file", (_event, data) => {
  if (openAgentFileCallback) {
    openAgentFileCallback(data)
  }
})

ipcRenderer.on("open-agent-file-error", (_event, errorMsg) => {
  if (openAgentFileErrorCallback) {
    openAgentFileErrorCallback(errorMsg)
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
  onOpenAgentFileError: (cb: (errorMsg: string) => void) => {
    openAgentFileErrorCallback = cb
  },
  appReadyForFiles: () => {
    ipcRenderer.send("app-ready-for-files")
  },
  resolveAgentFile: (filePath: string): Promise<UnpackPayload> =>
    ipcRenderer.invoke("resolve-agent-file", filePath)
})
