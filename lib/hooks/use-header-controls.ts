/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { useContext } from "react"
import { ChatbotUIContext } from "@/context/context"

export const useHeaderControls = () => {
  const {
    showSidebar,
    setShowSidebar,
    showRightSidebar,
    setShowRightSidebar,
    showDebugPanels,
    setShowDebugPanels
  } = useContext(ChatbotUIContext)

  return {
    showSidebar,
    showRightSidebar,
    showDebugPanels,
    onToggleSidebar: () => setShowSidebar(!showSidebar),
    onToggleRightSidebar: () => setShowRightSidebar(!showRightSidebar),
    onToggleDebugPanels: (checked: boolean) => {
      localStorage.setItem("showDebugPanels", String(checked))
      setShowDebugPanels(checked)
    }
  }
}
