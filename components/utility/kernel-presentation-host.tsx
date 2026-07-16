"use client"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { useEffect } from "react"
import { useChannelStore, selectViewedActiveCss } from "@/lib/store/channel-store"
import { reconcileCssLinks } from "@/lib/kernel-effects"

// The DOM sink for project/plans/017's presentation-effects pipeline. This is
// the ONLY component that calls reconcileCssLinks — it exists purely to keep
// the invariant: document.head's dot-agent stylesheet links always equal
// activeCss[viewedThreadId], nothing more. `apply_css`/`remove_css` effects
// from either loadBehavior or a send_intent advance (see
// agent-session-provider.tsx, channel-controller.ts) only ever update the
// store; this is what turns that desired state into the actual DOM, and only
// for the thread on screen.
//
// Mounted once near the app root, independent of whether RightSidebar (or any
// other agent-aware panel) happens to be mounted — a chat switch must clear a
// leaked theme even if the user never opens the agent details panel.
//
// selectViewedActiveCss returns a stable reference (a shared empty-array
// sentinel, or the same array activeCss[threadId] already held) unless the
// desired set actually changed, so this needs no shallow-equality wrapper to
// avoid re-running on every unrelated store update.
export function KernelPresentationHost() {
  const desiredCss = useChannelStore(selectViewedActiveCss)

  useEffect(() => {
    reconcileCssLinks(desiredCss)
  }, [desiredCss])

  return null
}
