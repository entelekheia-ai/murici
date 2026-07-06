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

import { cn } from "@/lib/utils"
import { FC, KeyboardEvent, LiHTMLAttributes } from "react"

export interface ListItemProps extends LiHTMLAttributes<HTMLLIElement> {
  label: string
  selected?: boolean
}

export const ListItem: FC<ListItemProps> = ({
  label,
  selected = false,
  className,
  onClick,
  onKeyDown,
  ...props
}) => {
  const handleKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onClick?.(e as any)
    }
    onKeyDown?.(e)
  }

  return (
    <li
      role="option"
      aria-selected={selected}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex h-[37px] w-full cursor-pointer select-none items-center justify-start rounded-[8px] px-3 py-2.5 transition-colors outline-none focus-visible:bg-black/5 dark:focus-visible:bg-white/5",
        selected
          ? "bg-background-secondary text-foreground-primary text-small-semi-strong"
          : "bg-transparent text-foreground-primary text-small-regular hover:bg-black/5 dark:hover:bg-white/5",
        className
      )}
      {...props}
    >
      {label}
    </li>
  )
}
