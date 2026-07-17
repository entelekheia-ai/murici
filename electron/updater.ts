// SPDX-License-Identifier: Apache-2.0

import { app, dialog } from "electron"
import { loadMenuStrings } from "./menu-i18n"

export function setupAutoUpdater(getLocale: () => string) {
  let autoUpdater: any
  try {
    autoUpdater = require("electron-updater").autoUpdater
  } catch {
    console.warn(
      "[updater] electron-updater not available, skipping auto-update"
    )
    return
  }

  // Prerelease track: the update channel is baked into the build's own version.
  // A stable build (0.11.0) stays on `latest` and never sees prereleases. An
  // alpha/beta build (0.11.0-alpha.1 / -beta.1) opts into its channel, so testers
  // who install a prerelease keep riding prereleases down to the eventual stable.
  const version = app.getVersion()
  const prereleaseChannel = version.includes("-alpha")
    ? "alpha"
    : version.includes("-beta")
      ? "beta"
      : null

  autoUpdater.allowPrerelease = prereleaseChannel !== null
  if (prereleaseChannel) autoUpdater.channel = prereleaseChannel
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on("error", (err: Error) => {
    console.error("[updater] error:", err.message)
  })

  autoUpdater.on("update-downloaded", (info: any) => {
    const t = loadMenuStrings(getLocale())
    dialog
      .showMessageBox({
        type: "info",
        title: t("Update available"),
        message: t("Version {{version}} downloaded. Restart to apply?").replace(
          "{{version}}",
          info.version
        ),
        buttons: [t("Restart now"), t("Later")]
      })
      .then(({ response }: { response: number }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
  })

  autoUpdater.checkForUpdatesAndNotify().catch((err: Error) => {
    console.warn("[updater] checkForUpdates failed:", err.message)
  })
}
