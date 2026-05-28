/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import { IconMoon, IconSun } from "@tabler/icons-react"
import { useTheme } from "next-themes"
import { FC } from "react"
import { SIDEBAR_ICON_SIZE } from "../sidebar/sidebar-switcher"
import { Button } from "../ui/button"

interface ThemeSwitcherProps {}

export const ThemeSwitcher: FC<ThemeSwitcherProps> = () => {
  const { setTheme, theme } = useTheme()

  const handleChange = (theme: "dark" | "light") => {
    localStorage.setItem("theme", theme)

    setTheme(theme)
  }

  return (
    <Button
      className="flex cursor-pointer space-x-2"
      variant="ghost"
      size="icon"
      onClick={() => handleChange(theme === "light" ? "dark" : "light")}
    >
      {theme === "dark" ? (
        <IconMoon size={SIDEBAR_ICON_SIZE} />
      ) : (
        <IconSun size={SIDEBAR_ICON_SIZE} />
      )}
    </Button>
  )
}
