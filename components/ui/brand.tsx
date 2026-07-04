/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

"use client"

import { FC } from "react"
import Image from "next/image"

interface BrandProps {
  theme?: "dark" | "light"
}

export const Brand: FC<BrandProps> = ({ theme = "dark" }) => {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex size-[96px] items-center justify-center overflow-hidden rounded-[12px] shadow-lg bg-[#126e3d]">
        <Image 
          src="/murici.svg" 
          alt="Murici" 
          width={96} 
          height={96} 
          className="rounded-[12px]"
          priority 
        />
      </div>
      <div className="font-signika font-medium text-[48px] leading-none text-[#0B2C1A] dark:text-[#FFEAB4]">
        murici
      </div>
    </div>
  )
}
