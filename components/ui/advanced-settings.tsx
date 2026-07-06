/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible"
import { IconChevron } from "@/components/icons/chat-icons"
import { useTranslation } from "react-i18next"
import { FC, useState } from "react"

interface AdvancedSettingsProps {
  children: React.ReactNode
}

export const AdvancedSettings: FC<AdvancedSettingsProps> = ({ children }) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)

  const handleOpenChange = (isOpen: boolean) => {
    setIsOpen(isOpen)
  }

  return (
    <Collapsible
      className="border-t border-stroke-secondary pt-4 mt-4"
      open={isOpen}
      onOpenChange={handleOpenChange}
    >
      <CollapsibleTrigger className="w-full outline-none focus-visible:opacity-70">
        <div className="flex w-full items-center justify-between text-small-semi-strong text-foreground-primary">
          <span>{t("Advanced Settings")}</span>
          <IconChevron
            size={16}
            className={`text-foreground-secondary transition-transform duration-200 ${
              isOpen ? "rotate-0" : "-rotate-90"
            }`}
          />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-4">{children}</CollapsibleContent>
    </Collapsible>
  )
}
