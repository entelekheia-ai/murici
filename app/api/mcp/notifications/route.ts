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

import { NextResponse } from "next/server"
// import { mcpClientManager } from "@/lib/mcp/client-manager"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  // A placeholder for the SSE endpoint that pushes spontaneous MCP events to the frontend.
  // In a full implementation, this would attach a listener to mcpClientManager's active clients
  // and pipe events into a ReadableStream.

  const stream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat
      controller.enqueue(`data: ${JSON.stringify({ type: "connected" })}\n\n`)

      const interval = setInterval(() => {
        controller.enqueue(`data: ${JSON.stringify({ type: "ping" })}\n\n`)
      }, 30000)

      // When clients get disconnected or connected, or tool progress events occur,
      // they would be enqueued here.

      req.signal.addEventListener("abort", () => {
        clearInterval(interval)
        controller.close()
      })
    }
  })

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  })
}
