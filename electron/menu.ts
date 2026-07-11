/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { app, Menu, MenuItemConstructorOptions } from "electron"
import { loadMenuStrings } from "./menu-i18n"

export type MenuAction =
  | "new-chat"
  | "open-settings"
  | "view-chat"
  | "view-knowledge"
  | "view-agents"
  | "toggle-chat-list"
  | "toggle-details"

export interface MenuState {
  locale: string
  debugMode: boolean
  showChatList: boolean
  showDetails: boolean
}

export interface BuildMenuCallbacks {
  onAction: (action: MenuAction) => void
  onLoadAgent: () => void
}

export function buildAppMenu(state: MenuState, callbacks: BuildMenuCallbacks): void {
  const { locale, debugMode, showChatList, showDetails } = state
  const { onAction, onLoadAgent } = callbacks
  const t = loadMenuStrings(locale)
  const isMac = process.platform === "darwin"

  const fileMenu: MenuItemConstructorOptions = {
    label: t("File"),
    submenu: [
      { label: t("New Chat"), accelerator: "CmdOrCtrl+N", click: () => onAction("new-chat") },
      { label: t("Load .agent…"), accelerator: "CmdOrCtrl+O", click: onLoadAgent },
      ...(isMac
        ? []
        : ([
            { type: "separator" },
            { label: t("Settings…"), accelerator: "Ctrl+,", click: () => onAction("open-settings") },
            { type: "separator" },
            { label: t("Exit"), accelerator: "Ctrl+Q", role: "quit" }
          ] as MenuItemConstructorOptions[]))
    ]
  }

  const editMenu: MenuItemConstructorOptions = {
    label: t("Edit"),
    submenu: [
      { label: t("Undo"), role: "undo" },
      { label: t("Redo"), role: "redo" },
      { type: "separator" },
      { label: t("Cut"), role: "cut" },
      { label: t("Copy"), role: "copy" },
      { label: t("Paste"), role: "paste" },
      { label: t("Select All"), role: "selectAll" }
    ]
  }

  const viewMenu: MenuItemConstructorOptions = {
    label: t("View"),
    submenu: [
      { label: t("Chat"), accelerator: "CmdOrCtrl+1", click: () => onAction("view-chat") },
      { label: t("Knowledge"), accelerator: "CmdOrCtrl+2", click: () => onAction("view-knowledge") },
      { label: t("Agents"), accelerator: "CmdOrCtrl+3", click: () => onAction("view-agents") },
      { type: "separator" },
      {
        label: showChatList ? t("Hide Chat List") : t("Show Chat List"),
        accelerator: isMac ? "Control+Command+S" : "Ctrl+Alt+S",
        click: () => onAction("toggle-chat-list")
      },
      {
        label: showDetails ? t("Hide Details") : t("Show Details"),
        accelerator: isMac ? "Shift+Command+P" : "Ctrl+Shift+P",
        click: () => onAction("toggle-details")
      },
      ...(debugMode
        ? ([
            { type: "separator" },
            { label: t("Toggle Dev Tools"), role: "toggleDevTools" }
          ] as MenuItemConstructorOptions[])
        : [])
    ]
  }

  const windowMenu: MenuItemConstructorOptions = {
    label: t("Window"),
    submenu: [
      { label: t("Minimize"), role: "minimize" },
      { label: t("Close"), role: "close" },
      ...(isMac
        ? ([{ type: "separator" }, { label: t("Front"), role: "front" }] as MenuItemConstructorOptions[])
        : [])
    ]
  }

  const template: MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { label: t("About"), role: "about" },
        { type: "separator" },
        { label: t("Settings…"), accelerator: "Cmd+,", click: () => onAction("open-settings") },
        { type: "separator" },
        { label: t("Services"), role: "services", submenu: [] },
        { type: "separator" },
        { label: t("Hide"), role: "hide" },
        { label: t("Hide Others"), role: "hideOthers" },
        { label: t("Show All"), role: "unhide" },
        { type: "separator" },
        { label: t("Quit"), accelerator: "Cmd+Q", role: "quit" }
      ]
    })
  }

  template.push(fileMenu, editMenu, viewMenu, windowMenu)

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
