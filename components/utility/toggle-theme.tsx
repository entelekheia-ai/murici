/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 */

import { FC } from "react"
import { useTheme } from "next-themes"
import { Button } from "../ui/button"
import { IconSunFigma, IconMoonFigma } from "../icons/chat-icons"

interface ToggleThemeProps {
  mode?: "Dark" | "Light"
  onClick?: () => void
  className?: string
}

export const ToggleTheme: FC<ToggleThemeProps> = ({ mode, onClick, className }) => {
  const { setTheme, theme } = useTheme()

  const currentTheme = theme === "dark" ? "dark" : "light"
  
  // Resolve mode: if mode prop is provided, use it. Otherwise, use active theme.
  // Figma Mode=Dark shows sun. Figma Mode=Light shows moon.
  const resolvedMode = mode || (currentTheme === "dark" ? "Dark" : "Light")

  const handleChange = () => {
    if (onClick) {
      onClick()
      return
    }
    const targetTheme = currentTheme === "light" ? "dark" : "light"
    localStorage.setItem("theme", targetTheme)
    setTheme(targetTheme)
  }

  return (
    <Button
      className={`flex cursor-pointer space-x-2 text-brand-text transition-opacity hover:opacity-80 ${className || ""}`}
      variant="ghost"
      size="icon"
      onClick={handleChange}
      aria-label="Toggle Theme"
    >
      {resolvedMode === "Dark" ? (
        <IconSunFigma size={18} className="text-brand-text" />
      ) : (
        <IconMoonFigma size={18} className="text-brand-text" />
      )}
    </Button>
  )
}
