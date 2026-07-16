"use client"
import { ChevronRight } from "lucide-react"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { Sidebar } from "@/components/sidebar/sidebar"
import { Button } from "@/components/ui/button"
import { Tabs } from "@/components/ui/tabs"
import useHotkey from "@/lib/hooks/use-hotkey"
import { cn } from "@/lib/utils"
import { ChatbotUIContext } from "@/context/context"
import { ContentType } from "@/types"
import { OsPendingAgentFile } from "@/types/electron"

import {
  usePathname,
  useRouter,
  useSearchParams,
  useParams
} from "next/navigation"
import dynamic from "next/dynamic"
import { FC, useEffect, useState, useContext, useCallback, useRef } from "react"
import { useSelectFileHandler } from "../chat/chat-hooks/use-select-file-handler"
import { useAgentSession } from "@/lib/hooks/use-agent-session"
import { useChatHandler } from "@/lib/hooks/use-chat-handler"
import { CommandK } from "../utility/command-k"
import { getSetting } from "@/lib/local-db/settings"
import { computeSidebarVisibility } from "@/lib/hooks/sidebar-auto-collapse"

const APP_VERSION = "0.0.5"

// Load RightSidebar only on client to avoid WASM SSR issues
const RightSidebar = dynamic(
  () =>
    import("../sidebar/right-sidebar").then(mod => ({
      default: mod.RightSidebar
    })),
  {
    ssr: false,
    loading: () => <div className="h-full w-[400px] animate-pulse bg-muted" />
  }
)

export const SIDEBAR_WIDTH = 280

// Keep in sync with the `w-[320px]` class on RightSidebar's panel root.
const RIGHT_SIDEBAR_WIDTH = 320
// Below this, the center panel is considered too cramped to keep both
// sidebars open (matches the `sm:min-w-fit` intent on the center panel).
const CENTER_MIN_WIDTH = 320

interface DashboardProps {
  children: React.ReactNode
}

export const Dashboard: FC<DashboardProps> = ({ children }) => {
  // Tracks whether the resize-driven auto-collapse effect (below) closed a
  // sidebar for lack of space, as opposed to the user closing it on purpose.
  // Only auto-closed sidebars are candidates for automatic re-expansion.
  const autoCollapsedLeftRef = useRef(false)
  const autoCollapsedRightRef = useRef(false)

  useHotkey("s", () => {
    autoCollapsedLeftRef.current = false
    setShowSidebar(prevState => !prevState)
  })

  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const params = useParams()
  const workspaceid = (params?.workspaceid as string) || "local"
  const tabValue = searchParams.get("tab") || "chats"

  const { handleSelectDeviceFile } = useSelectFileHandler()
  const { handleAgentFile } = useAgentSession()
  const { handleNewChat } = useChatHandler()

  const [contentType, setContentType] = useState<ContentType>(
    tabValue as ContentType
  )
  const {
    showSidebar,
    setShowSidebar,
    showRightSidebar,
    setShowRightSidebar,
    setOsPendingAgentPayload
  } = useContext(ChatbotUIContext)

  // Main hands over the PATH of a .agent the OS opened; right-sidebar unpacks it (and
  // reports its own failures). There is no "open-agent-file-error" channel any more —
  // main no longer unpacks, so it has nothing left to fail at.
  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI?.onOpenAgentFile) {
      window.electronAPI.onOpenAgentFile((data: OsPendingAgentFile) => {
        setOsPendingAgentPayload(data)
        setShowRightSidebar(true)
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

  useEffect(() => {
    window.electronAPI?.setSidebarState?.({ showSidebar, showRightSidebar })
  }, [showSidebar, showRightSidebar])

  useEffect(() => {
    window.electronAPI?.onMenuAction?.(data => {
      switch (data.action) {
        case "new-chat":
          handleNewChat()
          break
        case "open-settings":
          window.dispatchEvent(new Event("murici:profile-open"))
          break
        case "view-chat":
          window.dispatchEvent(
            new CustomEvent("murici:sidebar-navigate", { detail: "chats" })
          )
          break
        case "view-agents":
          window.dispatchEvent(
            new CustomEvent("murici:sidebar-navigate", { detail: "agents" })
          )
          break
        case "view-knowledge":
          router.push(`/${workspaceid}/graph`)
          break
        case "toggle-chat-list":
          autoCollapsedLeftRef.current = false
          setShowSidebar(prevState => {
            localStorage.setItem("showSidebar", String(!prevState))
            return !prevState
          })
          break
        case "toggle-details":
          autoCollapsedRightRef.current = false
          setShowRightSidebar(prevState => !prevState)
          break
      }
    })
  }, [handleNewChat, workspaceid, router, setShowSidebar, setShowRightSidebar])

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

  // Observes the outer container's total width (not the center panel's own
  // width, which changes as a *side effect* of hiding/showing a sidebar and
  // would otherwise feed back into this logic and cause flicker). Hides the
  // left sidebar first, then the right, once the center panel would drop
  // below CENTER_MIN_WIDTH; restores whichever of those it auto-hid, right
  // first then left, once there's room again.
  const rootRef = useRef<HTMLDivElement>(null)

  // Mirrors of the latest state, read inside the ResizeObserver callback
  // below instead of closed-over state. The observer is created once (see
  // the empty dependency array further down) — recreating it on every
  // showSidebar/showRightSidebar change would re-trigger its mandatory
  // initial synthetic callback, which reported the just-toggled state back
  // against the *unchanged* window width and immediately re-collapsed the
  // sidebar the user had just opened by hand (visible as a blink).
  const showSidebarRef = useRef(showSidebar)
  const showRightSidebarRef = useRef(showRightSidebar)
  const sidebarWidthRef = useRef(sidebarWidth)

  useEffect(() => {
    showSidebarRef.current = showSidebar
  }, [showSidebar])

  useEffect(() => {
    showRightSidebarRef.current = showRightSidebar
  }, [showRightSidebar])

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth
  }, [sidebarWidth])

  useEffect(() => {
    const node = rootRef.current
    if (!node) return

    const evaluateSidebarSpace = (totalWidth: number) => {
      const left = showSidebarRef.current
      const right = showRightSidebarRef.current
      const result = computeSidebarVisibility({
        totalWidth,
        left,
        right,
        leftWidth: sidebarWidthRef.current,
        rightWidth: RIGHT_SIDEBAR_WIDTH,
        centerMinWidth: CENTER_MIN_WIDTH,
        autoCollapsedLeft: autoCollapsedLeftRef.current,
        autoCollapsedRight: autoCollapsedRightRef.current
      })

      autoCollapsedLeftRef.current = result.autoCollapsedLeft
      autoCollapsedRightRef.current = result.autoCollapsedRight
      if (result.left !== left) setShowSidebar(result.left)
      if (result.right !== right) setShowRightSidebar(result.right)
    }

    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) evaluateSidebarSpace(entry.contentRect.width)
    })
    observer.observe(node)

    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    autoCollapsedLeftRef.current = false
    setShowSidebar(prevState => !prevState)
    localStorage.setItem("showSidebar", String(!showSidebar))
  }

  return (
    <div ref={rootRef} className="flex size-full">
      <CommandK />

      <div
        data-dot-agent-ui="chat-list"
        className={cn(
          "relative",
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
            <div className="flex size-full flex-col">
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
            className="absolute inset-y-0 right-0 z-50 w-[4px] cursor-col-resize transition-colors hover:bg-primary/20"
            onMouseDown={startResizing}
          />
        )}
      </div>

      <div
        // sm:min-w-[320px] mirrors CENTER_MIN_WIDTH above — keep both in sync.
        className="relative flex flex-1 flex-col overflow-hidden sm:min-w-[320px]"
        onDrop={onFileDrop}
        onDragOver={onDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
      >
        {isDragging ? (
          <div className="flex h-full items-center justify-center text-2xl text-white">
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
