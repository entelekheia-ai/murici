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

import { autoUpdater } from "electron-updater"
import { dialog } from "electron"

export function setupAutoUpdater() {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on("error", err => {
    console.error("[updater] error:", err.message)
  })

  autoUpdater.on("update-downloaded", info => {
    dialog
      .showMessageBox({
        type: "info",
        title: "Atualização disponível",
        message: `Versão ${info.version} baixada. Reiniciar para aplicar?`,
        buttons: ["Reiniciar agora", "Depois"]
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
  })

  autoUpdater.checkForUpdatesAndNotify().catch(err => {
    console.warn("[updater] checkForUpdates failed:", err.message)
  })
}
