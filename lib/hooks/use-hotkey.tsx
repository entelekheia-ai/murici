/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import { useEffect } from "react"

const isMac = (): boolean =>
  typeof window !== "undefined" &&
  (window.electronAPI?.platform ?? navigator.platform).toLowerCase().includes("mac")

const useHotkey = (key: string, callback: () => void): void => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const isMod = isMac() ? event.metaKey : event.ctrlKey
      if (isMod && event.shiftKey && event.key === key) {
        event.preventDefault()
        callback()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [key, callback])
}

export default useHotkey
