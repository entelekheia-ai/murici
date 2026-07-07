/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

"use client"

import { Sidebar } from "@/components/sidebar/sidebar"
import { Button } from "@/components/ui/button"
import { Tabs } from "@/components/ui/tabs"
import useHotkey from "@/lib/hooks/use-hotkey"
import { cn } from "@/lib/utils"
import { ChatbotUIContext } from "@/context/context"
import { ContentType } from "@/types"
import { OsPendingAgentFile } from "@/types/electron"
import { IconChevronCompactRight } from "@tabler/icons-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import { FC, useEffect, useState, useContext, useCallback } from "react"
import { useSelectFileHandler } from "../chat/chat-hooks/use-select-file-handler"
import { useAgentSession } from "@/lib/hooks/use-agent-session"
import { CommandK } from "../utility/command-k"
import { getSetting } from "@/lib/local-db/settings"
import { toast } from "sonner"

const APP_VERSION = "0.0.5"

// Load RightSidebar only on client to avoid WASM SSR issues
const RightSidebar = dynamic(
  () =>
    import("../sidebar/right-sidebar").then(mod => ({
      default: mod.RightSidebar
    })),
  {
    ssr: false,
    loading: () => <div className="bg-muted h-full w-[400px] animate-pulse" />
  }
)

export const SIDEBAR_WIDTH = 280

interface DashboardProps {
  children: React.ReactNode
}

export const Dashboard: FC<DashboardProps> = ({ children }) => {
  useHotkey("s", () => setShowSidebar(prevState => !prevState))

  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabValue = searchParams.get("tab") || "chats"

  const { handleSelectDeviceFile } = useSelectFileHandler()
  const { handleAgentFile } = useAgentSession()

  const [contentType, setContentType] = useState<ContentType>(
    tabValue as ContentType
  )
  const { showSidebar, setShowSidebar, showRightSidebar, setShowRightSidebar, setOsPendingAgentPayload } = useContext(ChatbotUIContext)

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI?.onOpenAgentFile) {
      window.electronAPI.onOpenAgentFile((data: OsPendingAgentFile) => {
        setOsPendingAgentPayload(data)
        setShowRightSidebar(true)
      })
      window.electronAPI.onOpenAgentFileError?.((errorMsg: string) => {
        toast.error(`Falha ao abrir arquivo .agent: ${errorMsg}`)
      })
      window.electronAPI.appReadyForFiles?.()
    }
  }, [setOsPendingAgentPayload, setShowRightSidebar])

  // RightSidebar is only mounted once showRightSidebar is true, but that's
  // also where the onboarding-agent first-run auto-load effect lives — a
  // chicken-and-egg gap that left first-time users with no sidebar and
  // nothing to open it. Just flip visibility here so RightSidebar mounts and
  // its own effect can take it from there; the "seen" write happens there too.
  useEffect(() => {
    ;(async () => {
      const seenVersion = await getSetting("onboarding_seen_version")
      if (seenVersion !== APP_VERSION) setShowRightSidebar(true)
    })()
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent<string>).detail as ContentType
      setContentType(tab)
      setShowSidebar(true)
      localStorage.setItem("showSidebar", "true")
      router.replace(`${pathname}?tab=${tab}`)
    }
    window.addEventListener("murici:sidebar-navigate", handler)
    return () => window.removeEventListener("murici:sidebar-navigate", handler)
  }, [pathname, router])

  const [sidebarWidth, setSidebarWidth] = useState<number>(280)
  const [isResizing, setIsResizing] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sidebarWidth")
      if (saved) {
        const parsed = parseInt(saved, 10)
        if (parsed >= 240 && parsed <= 300) setSidebarWidth(parsed)
      }
    }
  }, [])

  const startResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault()
    setIsResizing(true)
  }, [])

  const stopResizing = useCallback(() => {
    setIsResizing(false)
  }, [])

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (isResizing) {
        const newWidth = mouseMoveEvent.clientX
        if (newWidth >= 240 && newWidth <= 300) {
          setSidebarWidth(newWidth)
          localStorage.setItem("sidebarWidth", String(newWidth))
        }
      }
    },
    [isResizing]
  )

  useEffect(() => {
    window.addEventListener("mousemove", resize)
    window.addEventListener("mouseup", stopResizing)
    return () => {
      window.removeEventListener("mousemove", resize)
      window.removeEventListener("mouseup", stopResizing)
    }
  }, [resize, stopResizing])

  const [isDragging, setIsDragging] = useState(false)

  const onFileDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()

    const file = event.dataTransfer.files[0]
    if (file?.name.endsWith(".agent")) {
      handleAgentFile(file)
    } else {
      handleSelectDeviceFile(file)
    }

    setIsDragging(false)
  }

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
  }

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
  }

  const handleToggleSidebar = () => {
    setShowSidebar(prevState => !prevState)
    localStorage.setItem("showSidebar", String(!showSidebar))
  }

  return (
    <div className="flex size-full">
      <CommandK />

      <div
        className={cn(
          "bg-background-primary relative",
          !isResizing && "duration-200",
          showSidebar ? "border-r border-stroke" : ""
        )}
        style={{
          // Sidebar
          minWidth: showSidebar ? `${sidebarWidth}px` : "0px",
          maxWidth: showSidebar ? `${sidebarWidth}px` : "0px",
          width: showSidebar ? `${sidebarWidth}px` : "0px"
        }}
      >
        {showSidebar && (
          <Tabs
            className="flex h-full"
            value={contentType}
            onValueChange={tabValue => {
              setContentType(tabValue as ContentType)
              router.replace(`${pathname}?tab=${tabValue}`)
            }}
          >
            <div className="flex h-full w-full flex-col">
              <Sidebar
                contentType={contentType}
                showSidebar={showSidebar}
                onContentTypeChange={setContentType}
                onToggleSidebar={handleToggleSidebar}
              />
            </div>
          </Tabs>
        )}
        {showSidebar && (
          <div
            className="absolute right-0 top-0 bottom-0 w-[4px] cursor-col-resize hover:bg-primary/20 z-50 transition-colors"
            onMouseDown={startResizing}
          />
        )}
      </div>

      <div
        className="bg-muted/50 relative flex flex-1 flex-col overflow-hidden sm:min-w-fit"
        onDrop={onFileDrop}
        onDragOver={onDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
      >
        {isDragging ? (
          <div className="flex h-full items-center justify-center bg-black/50 text-2xl text-white">
            drop file here
          </div>
        ) : (
          <div className="flex size-full overflow-hidden">
            <div className="flex-1 overflow-hidden">{children}</div>
            {showRightSidebar && <RightSidebar />}
          </div>
        )}
      </div>
    </div>
  )
}
