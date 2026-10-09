// SPDX-License-Identifier: Apache-2.0

import defaultLens from "./default.cview"
import chatLens from "./chat.cview"
import agentLens from "./agent.cview"

/** The lenses of the knowledge graph; the same three the vis-network canvas offers. */
export type LensKey = "default" | "chat" | "agent"

/** Each lens document's text, parsed by the host with `parseView`. */
export const LENS_SOURCES: Record<LensKey, string> = {
  default: defaultLens,
  chat: chatLens,
  agent: agentLens
}
