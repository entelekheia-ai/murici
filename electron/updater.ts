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
