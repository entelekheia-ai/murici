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

"use client"

import { FC } from "react"

interface MessageThinkingBlockProps {
  thinking: string
}

export const MessageThinkingBlock: FC<MessageThinkingBlockProps> = ({
  thinking
}) => {
  const wordCount = thinking.trim().split(/\s+/).filter(Boolean).length

  return (
    <div className="border-border bg-muted/20 text-muted-foreground rounded-lg border font-mono text-xs">
      <details>
        <summary className="hover:bg-muted/40 flex cursor-pointer select-none items-center gap-2 px-3 py-2">
          <span>🧠</span>
          <span className="font-semibold text-violet-400">Raciocínio</span>
          <span className="text-muted-foreground/60">{wordCount} palavras</span>
        </summary>
        <pre className="bg-muted mx-3 mb-2 max-h-64 overflow-auto whitespace-pre-wrap rounded p-2 text-xs">
          {thinking}
        </pre>
      </details>
    </div>
  )
}
