"use client"
/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import React from "react"
import { useFormStatus } from "react-dom"
import { Button, ButtonProps } from "./button"

const SubmitButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (props, ref) => {
    const { pending } = useFormStatus()

    return <Button disabled={pending} ref={ref} {...props} />
  }
)

SubmitButton.displayName = "SubmitButton"

export { SubmitButton }
