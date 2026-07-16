/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { FC, ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface ButtonGhostProps {
  className?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  showLeftIcon?: boolean
  showRightIcon?: boolean
  size?: "Default" | "16px"
  text?: string
  onClick?: () => void
  disabled?: boolean
}

export const ButtonGhost: FC<ButtonGhostProps> = ({
  className,
  leftIcon,
  rightIcon,
  showLeftIcon = true,
  showRightIcon = true,
  size = "Default",
  text = "Text",
  onClick,
  disabled
}) => {
  const is16Px = size === "16px"

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex select-none items-center justify-center gap-[8px] whitespace-nowrap rounded-md font-medium text-foreground-terciary transition-all hover:opacity-60 disabled:pointer-events-none disabled:opacity-50",
        is16Px ? "h-8 px-2 text-[13px]" : "h-9 px-3 text-[14px]",
        className
      )}
      type="button"
    >
      {showLeftIcon && leftIcon && (
        <span
          className={cn(
            "flex shrink-0 items-center justify-center",
            is16Px ? "size-[16px]" : "size-[18px]"
          )}
        >
          {leftIcon}
        </span>
      )}
      {text && <span>{text}</span>}
      {showRightIcon && rightIcon && (
        <span
          className={cn(
            "flex shrink-0 items-center justify-center",
            is16Px ? "size-[16px]" : "size-[18px]"
          )}
        >
          {rightIcon}
        </span>
      )}
    </button>
  )
}
