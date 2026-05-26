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
