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
 * Streams API. The Vercel AI SDK relies on `TransformStream`/`ReadableStream`
 * even for code paths that don't touch the network, so any jsdom test that
 * imports from `ai` (even transitively) needs these polyfilled.
 */
import { ReadableStream, WritableStream, TransformStream } from "node:stream/web"
import { TextEncoder, TextDecoder } from "node:util"

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
