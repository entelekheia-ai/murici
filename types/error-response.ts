/*
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI)
 * This file is part of a derivative work, originally licensed under the MIT License.
 */

import { z } from "zod"

export type ErrorResponse = {
  error: {
    code: number
    message: string
  }
}

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.number({ coerce: true }).default(500),
    message: z.string().default("Internal Server Error")
  })
})
