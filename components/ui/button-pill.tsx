/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { ButtonHTMLAttributes, ReactNode, forwardRef } from "react"
import { cn } from "@/lib/utils"

export interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  showIcon?: boolean
  icon?: ReactNode
}

export const PillButton = forwardRef<HTMLButtonElement, PillButtonProps>(
  ({ className, label, showIcon = false, icon, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          "flex h-7 shrink-0 select-none items-center justify-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
          className
        )}
        {...props}
      >
        <span className="truncate">{label}</span>
        {showIcon && icon && (
          <span className="flex shrink-0 items-center justify-center">
            {icon}
          </span>
        )}
      </button>
    )
  }
)

PillButton.displayName = "PillButton"
