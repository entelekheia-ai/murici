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
import { ElementType, ComponentPropsWithoutRef } from "react"
import { useTranslation } from "react-i18next"

type BrandLogoProps<T extends ElementType = "h1"> = {
  as?: T
} & ComponentPropsWithoutRef<T>

export const BrandLogo = <T extends ElementType = "h1">({
  as,
  className,
  showIcon = false,
  ...props
}: BrandLogoProps<T> & { showIcon?: boolean }) => {
  const { t } = useTranslation()
  const Component = as || "h1"

  return (
    <Component
      className={cn(
        // Layout e Posicionamento
        "flex items-center gap-2 relative select-none shrink-0",
        // Tipografia
        "font-signika font-normal text-4xl leading-none whitespace-nowrap",
        // Cores (Claro / Escuro) - gerenciado pelo token no globals.css
        "text-brand-text",
        className
      )}
      aria-label={t("murici_logo", "Logotipo do Murici")}
      {...props}
    >
      {showIcon && (
        <div className="flex h-[32px] w-[31px] items-center justify-center overflow-hidden rounded-[9px] bg-[#126e3d]">
          <img src="/murici.svg" alt="" width={31} height={32} />
        </div>
      )}
      murici
    </Component>
  )
}
