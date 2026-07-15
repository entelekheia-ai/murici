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

export interface StreamErrorDetails {
  message: string
  statusCode?: number
  responseHeaders?: Record<string, string>
  responseBody?: string
  data?: unknown
  isRetryable?: boolean
  url?: string
}

// The AI SDK's onError callbacks (createUIMessageStream, toUIMessageStream) can
// only return a string — that's the one channel available to carry an
// APICallError's structured fields (statusCode/responseHeaders/responseBody/data)
// from the server to the client. Field-by-field extraction, not
// JSON.stringify(error) directly: Error/APICallError properties aren't reliably
// enumerable, so a blind stringify silently drops most of them.
export function serializeStreamError(error: unknown): string {
  const e = error as any
  const details: StreamErrorDetails = {
    message: e?.message || "An error occurred while streaming the response.",
    statusCode: e?.statusCode,
    responseHeaders: e?.responseHeaders,
    responseBody: e?.responseBody,
    data: e?.data,
    isRetryable: e?.isRetryable,
    url: e?.url
  }
  return JSON.stringify(details)
}

// Falls back to treating raw as the plain message when it isn't JSON — covers
// errors serialized before this migration and any error text that never went
// through serializeStreamError (e.g. a plain thrown string).
export function parseStreamError(raw: string): StreamErrorDetails {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === "object" && typeof parsed.message === "string") {
      return parsed
    }
  } catch {}
  return { message: raw }
}
