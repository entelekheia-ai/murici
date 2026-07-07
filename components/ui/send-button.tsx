import { Square, Send } from "lucide-react"
/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { ButtonHTMLAttributes, forwardRef } from "react"
import { cn } from "@/lib/utils"



export interface SendButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isGenerating?: boolean
  onStop?: () => void
}

export const SendButton = forwardRef<HTMLButtonElement, SendButtonProps>(
  ({ className, isGenerating = false, onStop, disabled, onClick, ...props }, ref) => {
    if (isGenerating) {
      return (
        <button
          ref={ref}
          type="button"
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-[8px] bg-transparent text-[#3f6212] transition-opacity hover:opacity-50 select-none shrink-0",
            className
          )}
          onClick={onStop}
          {...props}
        >
          <Square className="animate-pulse" size={20} />
        </button>
      )
    }

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-[8px] bg-[#3f6212] text-[#e2d7c6] transition-all select-none shrink-0",
          disabled ? "cursor-not-allowed opacity-50" : "hover:opacity-90 active:scale-95",
          className
        )}
        onClick={onClick}
        {...props}
      >
        <Send size={16} />
      </button>
    )
  }
)

SendButton.displayName = "SendButton"
