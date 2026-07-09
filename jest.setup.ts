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

/*
 * jsdom (the default Jest testEnvironment here) doesn't implement the Web
 * Streams API, and Jest's sandboxed "node" testEnvironment doesn't inherit
 * Node's own global fetch/Request/Response either. The Vercel AI SDK relies
 * on the stream classes even for code paths that don't touch the network.
 */
import { ReadableStream, WritableStream, TransformStream } from "node:stream/web"
import { TextEncoder, TextDecoder } from "node:util"
import { randomUUID } from "node:crypto"

/*
 * jest-environment-node 29.7.0 exposes `globalThis.crypto` via a lazy VM
 * binding that, on this Node version, can go stale mid-run: a later call to
 * `crypto.randomUUID()` within the same test file throws "crypto.randomUUID
 * is not a function" even though the very first call succeeded. Overwriting
 * it with the real `node:crypto` function (a plain function, no native
 * receiver/brand check like the Web Crypto method has) makes it stable for
 * the whole file.
 */
if (typeof (globalThis as any).crypto === "undefined") {
  ;(globalThis as any).crypto = {}
}
;(globalThis as any).crypto.randomUUID = randomUUID

if (typeof (globalThis as any).ReadableStream === "undefined") {
  ;(globalThis as any).ReadableStream = ReadableStream
}
if (typeof (globalThis as any).WritableStream === "undefined") {
  ;(globalThis as any).WritableStream = WritableStream
}
if (typeof (globalThis as any).TransformStream === "undefined") {
  ;(globalThis as any).TransformStream = TransformStream
}
if (typeof (globalThis as any).TextEncoder === "undefined") {
  ;(globalThis as any).TextEncoder = TextEncoder
}
if (typeof (globalThis as any).TextDecoder === "undefined") {
  ;(globalThis as any).TextDecoder = TextDecoder
}

// Minimal Request/Response polyfills — just enough for Next.js route handler
// tests that only call `request.json()` / read `response.status` /
// `response.json()`. The real `undici` implementation pulls in a much bigger
// web-platform dependency chain (MessagePort, structuredClone, Blob, ...)
// that Jest's sandboxed environment doesn't provide, so we don't use it here.
if (typeof (globalThis as any).Request === "undefined") {
  class MinimalRequest {
    url: string
    method: string
    private _body?: string
    constructor(url: string, init?: { method?: string; body?: string }) {
      this.url = url
      this.method = init?.method ?? "GET"
      this._body = init?.body
    }
    async json() {
      return this._body ? JSON.parse(this._body) : undefined
    }
    async text() {
      return this._body ?? ""
    }
  }
  ;(globalThis as any).Request = MinimalRequest
}

if (typeof (globalThis as any).Response === "undefined") {
  class MinimalResponse {
    status: number
    headers: Headers
    private _body?: string
    constructor(body?: string, init?: { status?: number; headers?: HeadersInit }) {
      this._body = body
      this.status = init?.status ?? 200
      // NextResponse's constructor reads `this.headers.getSetCookie()`, which
      // only the real (Node-native) Headers class implements.
      this.headers = new Headers(init?.headers)
    }
    async json() {
      return this._body ? JSON.parse(this._body) : undefined
    }
    async text() {
      return this._body ?? ""
    }
    static json(data: unknown, init?: { status?: number }) {
      return new MinimalResponse(JSON.stringify(data), init)
    }
  }
  ;(globalThis as any).Response = MinimalResponse
}
