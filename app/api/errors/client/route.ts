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

import { logger } from "@/lib/logger"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

/*
 * Receives client-side errors (React render crashes via ErrorBoundary,
 * uncaught exceptions, unhandled promise rejections) so they land in the
 * same Winston pipeline as server-side errors instead of only being visible
 * in the browser console — this is how bugs like the message.tsx
 * "image_paths is undefined" crash used to slip through: they only ever
 * showed up if a user happened to paste their browser console output.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { message } = body

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 })
    }

    // Forward the whole payload, not just a fixed allowlist — callers pass
    // arbitrary meta (e.g. use-chat-handler's onError passes `{ error }`),
    // and dropping unlisted fields here silently throws away the actual
    // underlying error text.
    logger.error("Client-side error", body)

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    logger.error("Failed to record client-side error report", { error: error.message })
    return NextResponse.json({ error: "internal error" }, { status: 500 })
  }
}
