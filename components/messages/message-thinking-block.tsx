"use client"
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

import { FC } from "react"
import { useTranslation } from "react-i18next"

interface MessageThinkingBlockProps {
  thinking: string
}

export const MessageThinkingBlock: FC<MessageThinkingBlockProps> = ({
  thinking
}) => {
  const { t } = useTranslation()
  const wordCount = thinking.trim().split(/\s+/).filter(Boolean).length

  return (
    <div
      data-testid="thinking-block"
      className="rounded-lg border border-border bg-muted/20 font-mono text-xs text-muted-foreground"
    >
      <details>
        <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 hover:bg-muted/40">
          <span>🧠</span>
          <span className="font-semibold text-violet-400">
            {t("Reasoning")}
          </span>
          <span className="text-muted-foreground/60">
            {t("{{count}} words", { count: wordCount })}
          </span>
        </summary>
        <pre className="mx-3 mb-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
          {thinking}
        </pre>
      </details>
    </div>
  )
}
