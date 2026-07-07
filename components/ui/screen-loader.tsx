import { Loader2 } from "lucide-react"
/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */


import { FC } from "react"

interface ScreenLoaderProps {}

export const ScreenLoader: FC<ScreenLoaderProps> = () => {
  return (
    <div className="flex size-full flex-col items-center justify-center">
      <Loader2 className="mt-4 size-12 animate-spin" />
    </div>
  )
}
