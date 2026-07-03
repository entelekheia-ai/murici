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
import { IconChevronCompactRight } from "@tabler/icons-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import { FC, useEffect, useState, useContext } from "react"
import { useSelectFileHandler } from "../chat/chat-hooks/use-select-file-handler"
import { CommandK } from "../utility/command-k"
import { getSetting } from "@/lib/local-db/settings"

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

  const [contentType, setContentType] = useState<ContentType>(
    tabValue as ContentType
  )
  const { showSidebar, setShowSidebar, showRightSidebar, setShowRightSidebar } = useContext(ChatbotUIContext)

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

  const [isDragging, setIsDragging] = useState(false)

  const onFileDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()

    const file = event.dataTransfer.files[0]
    if (file?.name.endsWith(".agent")) {
      window.dispatchEvent(new CustomEvent("agent:drop", { detail: { file } }))
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
          "bg-sidebar-bg duration-200 dark:border-none " + (showSidebar ? "border-r border-sidebar-border" : "")
        )}
        style={{
          // Sidebar
          minWidth: showSidebar ? `${SIDEBAR_WIDTH}px` : "0px",
          maxWidth: showSidebar ? `${SIDEBAR_WIDTH}px` : "0px",
          width: showSidebar ? `${SIDEBAR_WIDTH}px` : "0px"
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
              <Sidebar contentType={contentType} showSidebar={showSidebar} onContentTypeChange={setContentType} />
            </div>
          </Tabs>
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

        <Button
          className={cn(
            "absolute left-[4px] top-[50%] z-10 size-[32px] cursor-pointer"
          )}
          style={{
            // marginLeft: showSidebar ? `${SIDEBAR_WIDTH}px` : "0px",
            transform: showSidebar ? "rotate(180deg)" : "rotate(0deg)"
          }}
          variant="ghost"
          size="icon"
          onClick={handleToggleSidebar}
        >
          <IconChevronCompactRight size={24} />
        </Button>
      </div>
    </div>
  )
}
