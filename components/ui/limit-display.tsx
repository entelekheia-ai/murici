/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import { FC } from "react"

interface LimitDisplayProps {
  used: number
  limit: number
}

export const LimitDisplay: FC<LimitDisplayProps> = ({ used, limit }) => {
  return (
    <div className="text-xs italic">
      {used}/{limit}
    </div>
  )
}
