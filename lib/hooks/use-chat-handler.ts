/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { ChatHandlerContext } from "@/context/chat-handler-context"
import { useContext } from "react"

// Thin accessor for the shared chat-handler ViewModel (ChatHandlerProvider,
// mounted once near the app root). Carries no state or effects of its own —
// every call site reads and drives the same underlying useChat() instance,
// which is what fixed the bug this replaced (9 independent useChat()
// instances, one per call site of the old useChatHandler()).
export const useChatHandler = () => useContext(ChatHandlerContext)
