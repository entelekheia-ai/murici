<!--
 Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 https://www.apache.org/licenses/LICENSE-2.0
-->

# ADR-0006: Stream Error Details Now Reach the Client Intact

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-07-12 |
| Deciders | Danilo Borges |
| Supersedes | — |
| Superseded by | — |
| Last revised | — |

---

## Context

Reported live: when a provider call failed with a real, actionable error (e.g.
Anthropic's "Your credit balance is too low to access the Anthropic API", OpenAI's
`insufficient_quota`), neither the chat UI nor the debug panel showed that message —
only the AI SDK's generic placeholder, "An error occurred.", ever appeared client-side.
The terminal showed the real error object in full (`statusCode`, `responseHeaders`,
`responseBody`, `data`, `isRetryable`), which made it look like a logging-only gap.

Investigation traced it to `lib/server/agent-stream.ts:105`:
`result.toUIMessageStream()` was called with **no arguments**. That function
(`node_modules/ai/dist/index.js`) has its own internal `onError`, defaulting to
`() => "An error occurred."` — hardcoded in the SDK with the comment "prevent leaking
server error details to the client by default". This is what converts a
`streamText()`-level failure (the actual provider error) into the UI "error" part sent
to the client — and it runs **before** the outer `createUIMessageStream`'s `onError`
(already customized at `agent-stream.ts:107`) ever gets a chance to run, since that
outer handler only fires for something thrown inside the route's own `execute` body,
not for a failure inside the merged `result` stream.

Net effect: today, neither the readable message nor any structured detail ever reached
the client for this failure class — the rich object in the terminal only existed
because `logger.error(...)` already logged it server-side (`agent-stream.ts:108`),
never wired to the browser.

## Decision

1. A single `onError` function (`handleStreamError`), defined once per request in
   `agent-stream.ts`, passed to **both** places that accept one:
   - `result.toUIMessageStream({ onError: handleStreamError })` — the actual fix;
     this is the call site that was swallowing provider-level failures.
   - `createUIMessageStream({ execute, onError: handleStreamError })` — kept as a
     safety net for anything thrown inside `execute` itself, now sharing the exact
     same function instead of carrying its own separate implementation.
2. Since the SDK's `onError` contract can only return a `string` in both places, and
   the debug panel is expected to show full error detail (not just a message),
   `handleStreamError` serializes the relevant fields via
   `lib/errors/api-error.ts#serializeStreamError` (message, statusCode,
   responseHeaders, responseBody, data, isRetryable, url — extracted field-by-field,
   not `JSON.stringify(error)` directly, since `Error`/`APICallError` properties
   aren't reliably enumerable). The client recovers them with `parseStreamError`,
   falling back to `{ message: raw }` when the string isn't JSON (a plain thrown
   string, or an error type with no extra fields).

## Options considered

- **Keep only `.message`, drop the structured fields** — considered while scoping the
  fix, since the serialize/parse round-trip is one more moving part. Rejected: the
  debug panel losing the full error object (statusCode/responseBody/data) would be a
  regression from what a developer can already see in the server terminal — the whole
  point of wiring this through is to stop that information from being terminal-only.

## Consequences

**Fica mais fácil:**
- A user finally sees the real provider error (e.g. the actual billing message) as a
  chat bubble, not a generic placeholder — this was the bug that started the
  investigation.
- The debug panel's error row shows the same structured data a developer would
  otherwise have to go find in the server log.
- One `onError` implementation, not two independently maintained ones, for the two
  places the SDK requires it.

**Fica mais difícil / custos aceitos:**
- `error.message` on the client is no longer a plain human string — it's a JSON
  envelope that must be unwrapped via `parseStreamError`. Every future call site that
  reads a chat stream error needs to go through that helper instead of reading
  `.message` directly, or it will show the raw JSON text.
- Confirmed no new leak surface: `APICallError` (the AI SDK's error type for
  provider API failures) never carries the outgoing `Authorization` header — it only
  captures `url`, `requestBodyValues`, `statusCode`, `responseHeaders`, `responseBody`,
  `data`, `isRetryable` (`node_modules/@ai-sdk/provider/dist/index.d.ts:672`), and
  `responseHeaders`/`responseBody`/`data` come from the provider's response, not the
  outgoing request — so no API key ever flows through this path.

## Related

- `lib/server/agent-stream.ts` (`handleStreamError`, both `onError` call sites)
- `lib/errors/api-error.ts` (`serializeStreamError`/`parseStreamError`, new)
- `components/utility/chat-handler-provider.tsx` (`reportError`, `onError` of `useChat`)
- `components/messages/error-message-bubble.tsx` (always-visible summarized bubble)
- `components/messages/flow-event-card.tsx` (debug panel's full-JSON error row)
