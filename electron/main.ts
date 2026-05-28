import { app, BrowserWindow, shell } from "electron"
import * as path from "path"
import { startNextServer, stopNextServer } from "./next-server"
import { setupAutoUpdater } from "./updater"

const isDev =
  process.env.NODE_ENV === "development" ||
  process.env.ELECTRON_ENV === "development" ||
  !app.isPackaged

let mainWindow: BrowserWindow | null = null
let serverPort = 3000

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "default",
    show: false,
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
