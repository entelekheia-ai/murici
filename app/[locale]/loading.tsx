/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import { IconLoader2 } from "@tabler/icons-react"

export default function Loading() {
  return (
    <div className="flex size-full flex-col items-center justify-center">
      <IconLoader2 className="mt-4 size-12 animate-spin" />
    </div>
  )
}
