/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

import { IconPlusFigma } from "@/components/icons/chat-icons"
import { FC } from "react"
import { Button } from "../ui/button"

interface NewChatProps {
  label: string
  onClick: () => void
}

export const NewChat: FC<NewChatProps> = ({ label, onClick }) => {
  return (
    <div className="flex w-full">
      <Button
        variant="outline"
        className="flex h-[41px] grow items-center justify-start gap-2 rounded-[10px] border border-stroke bg-background-primary p-3 text-sm font-semibold text-foreground-primary hover:bg-background-primary/80"
        onClick={onClick}
      >
        <IconPlusFigma size={16} />
        {label}
      </Button>
    </div>
  )
}
