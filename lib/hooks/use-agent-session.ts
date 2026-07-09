/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { AgentSessionContext } from "@/context/agent-session-context"
import { useContext } from "react"

// Thin accessor for the shared agent-session ViewModel (AgentSessionProvider,
// mounted once near the app root). Carries no state or effects of its own,
// so calling it from multiple places (e.g. RightSidebar for rendering) reads
// and drives the same underlying session.
export const useAgentSession = () => useContext(AgentSessionContext)
