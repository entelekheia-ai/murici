/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import { FC } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "./tooltip"

interface WithTooltipProps {
  display: React.ReactNode
  trigger: React.ReactNode

  delayDuration?: number
  side?: "left" | "right" | "top" | "bottom"
}

export const WithTooltip: FC<WithTooltipProps> = ({
  display,
  trigger,

  delayDuration = 500,
  side = "right"
}) => {
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger>{trigger}</TooltipTrigger>

        <TooltipContent side={side}>{display}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
