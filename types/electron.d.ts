/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export interface AgentAboutme {
  id: string
  name: string
  version: string
  domain: string
  description: string
  persona?: string
  license: string
}

export interface UnpackPayload {
  aboutme: AgentAboutme
  behaviorText: string
  descriptionText?: string
  knowledge?: Array<{ path: string; content: string }>
  guides?: Array<{ path: string; content: string }>
  behaviors?: Array<{ path: string; content: string }>
}

// Carries the source filesystem path alongside the unpacked payload so it can
// be persisted (recent-agents list) and re-resolved later via
// electronAPI.resolveAgentFile. filePath is absent when opened from a plain
// web build (browsers don't expose real filesystem paths).
export interface OsPendingAgentFile {
  payload: UnpackPayload
  filePath?: string
}

export interface KernelState {
  currentState: string
  graph: string | null
  validIntents: string[]
  effects: import("./kernel-effect").Effect[]
}

declare global {
  interface Window {
    electronAPI?: {
      platform: string
      versions: {
        electron: string
        node: string
        chrome: string
      }
      onOpenAgentFile?: (
        cb: (data: OsPendingAgentFile) => void
      ) => void
      onOpenAgentFileError?: (cb: (errorMsg: string) => void) => void
      appReadyForFiles?: () => void
      resolveAgentFile?: (filePath: string) => Promise<UnpackPayload>
      onMenuAction?: (cb: (data: { action: string }) => void) => void
      setDebugMode?: (value: boolean) => void
      setLocale?: (locale: string) => void
      setSidebarState?: (state: { showSidebar?: boolean; showRightSidebar?: boolean }) => void
    }
  }
}

export { }
