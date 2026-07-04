/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { AgentSessionContext } from "@/context/agent-session-context"
import { useContext } from "react"

// Thin accessor for the shared agent-session ViewModel (AgentSessionProvider,
// mounted once near the app root). Safe to call from any component or hook —
// unlike useChatHandler, this carries no state or effects of its own, so
// calling it from multiple places (RightSidebar for rendering,
// useChatHandler for triggering a reset) reads/drives the same session.
export const useAgentSession = () => useContext(AgentSessionContext)
