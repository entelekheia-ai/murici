/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import { IconMoon } from "@tabler/icons-react"
import { useTheme } from "next-themes"
import { FC } from "react"
import { Button } from "../ui/button"
import { IconSunFigma } from "../icons/chat-icons"

interface ThemeSwitcherProps {}

export const ThemeSwitcher: FC<ThemeSwitcherProps> = () => {
  const { setTheme, theme } = useTheme()

  const handleChange = (theme: "dark" | "light") => {
    localStorage.setItem("theme", theme)

    setTheme(theme)
  }

  return (
    <Button
      className="flex cursor-pointer space-x-2 text-muted-foreground"
      variant="ghost"
      size="icon"
      onClick={() => handleChange(theme === "light" ? "dark" : "light")}
    >
      {theme === "dark" ? (
        <IconSunFigma size={18} />
      ) : (
        <IconMoon size={18} />
      )}
    </Button>
  )
}
