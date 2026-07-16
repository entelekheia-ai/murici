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

// An unpacked .agent bundle. Built in exactly ONE place — app/api/agent/unpack, reached
// through lib/agents/unpack-agent-file.ts — no matter how the agent was opened.
//
// The Electron main process used to build a second one by hand, and that copy had gone
// stale: it omitted `knowledge` and `guides`, so an agent opened through the desktop app
// lost its knowledge files and a `teach "recipes.txt"` effect handed the model the bare
// file NAME (resolveTeach in lib/runtime/advance-flow.ts falls back to it). Main now only
// supplies the file's bytes. The arrays are REQUIRED rather than optional so that "I
// forgot a field" cannot compile — empty is `[]`, never absent.
export interface UnpackPayload {
  aboutme: AgentAboutme
  behaviorText: string
  descriptionText?: string
  knowledge: Array<{ path: string; content: string }>
  guides: Array<{ path: string; content: string }>
  behaviors: Array<{ path: string; content: string }>
}

// An agent the OS handed to the app (macOS "open with", the launch argv, or the app
// menu's Load Agent). Main sends the PATH, not a payload: the renderer reads the bytes
// back via electronAPI.readAgentFile and unpacks them through the one unpack. The path
// is also what the recent-agents list persists, so the agent can be reopened later.
export interface OsPendingAgentFile {
  filePath: string
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
      onOpenAgentFile?: (cb: (data: OsPendingAgentFile) => void) => void
      appReadyForFiles?: () => void
      readAgentFile?: (filePath: string) => Promise<Uint8Array>
      getPathForFile?: (file: File) => string
      onMenuAction?: (cb: (data: { action: string }) => void) => void
      setDebugMode?: (value: boolean) => void
      setLocale?: (locale: string) => void
      setSidebarState?: (state: {
        showSidebar?: boolean
        showRightSidebar?: boolean
      }) => void
    }
  }
}

export {}
