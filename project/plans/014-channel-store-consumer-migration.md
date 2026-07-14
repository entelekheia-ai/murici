# Plan 014: Channel Store — Consumer Migration (off the legacy-context mirror)

> **Status:** READY TO START. The channels refactor has **landed**
> (see [ADR-0007](../adr/0007-per-thread-chat-channels.md) and its
> [log](../adr/0007-per-thread-chat-channels-log.md)), and the legacy-context mirror
> described below is now in place and working — the viewed channel writes it, background
> channels don't. So every consumer in the table still reads the mirror, and this doc is
> now the actual next step rather than a hypothetical.
>
> Two notes from the implementation that change the table below:
> - `chat-messages.tsx` already reads `viewedThreadId` from the store directly (for the
>   per-chat `flowEvents` filter), so it is partially migrated.
> - `components/messages/message.tsx` no longer writes `setIsGenerating` — that flag is now
>   DERIVED from the viewed channel's stream status, so it must never be written by hand.

## Context

The per-chat **channel** refactor (independent parallel chats, each owning its
own `useChat` stream + agent session + status + debug events) introduces a
Zustand store keyed by `chatId`
(`channels: Record<chatId, ChannelState>`). See the main channels plan for that.

To keep the first delivery's blast radius small, the **viewed** channel mirrors
its state into the existing legacy `ChatbotUIContext` fields (`chatMessages`,
`flowState`, `flowEvents`, `isGenerating`, `firstTokenReceived`, `agentPersona`,
`thinkingLog`). That means the ~10 existing UI consumers keep reading the
context they already read and **do not change** when channels land — they just
happen to be reading a mirror of whichever channel is on screen.

This doc tracks the eventual second step: migrating those consumers to read the
channel slice **directly** from the store (`useChannelStore(s => s.channels[s.viewedChatId]?.…)`),
after which the legacy-context mirror can be deleted.

## Motivation

The mirror is a bridge, not a destination. While it exists:
- there are two sources of truth (store slice + mirrored context field) that
  must be kept in sync by the viewed channel's controller;
- any component reading the mirror can only ever see the *viewed* channel, so
  features that want to show cross-channel state (e.g. a "generating" badge on a
  background chat in the sidebar) can't be built on the mirror — they must read
  the store directly.

Migrating consumers onto store selectors removes the double-write and unlocks
per-channel UI.

## Consumers to migrate (seed — verify/expand during development)

Client-side React consumers that today read the mirrored fields from
`ChatbotUIContext`. **Excluded** (do NOT migrate): the `app/api/chat/*` routes
and pure libs (`lib/build-prompt.ts`, `lib/runtime/advance-flow.ts`,
`lib/server/agent-stream.ts`) — they receive their data as function args / the
request body, not from React context.

| Field(s) | Consumer | Notes (fill during dev) |
|---|---|---|
| `chatMessages` | `components/messages/message.tsx` | |
| `chatMessages` | `components/chat/chat-messages.tsx` | already chat-scoped filter added for `flowEvents` |
| `chatMessages` | `components/chat/chat-input.tsx` | |
| `chatMessages` | `components/chat/chat-hooks/use-scroll.tsx` | |
| `chatMessages` | `components/chat/chat-hooks/use-chat-history.tsx` | |
| `chatMessages.length` | `app/[locale]/[workspaceid]/chat/page.tsx` | graph-home gate |
| `chatMessages` | `components/chat/chat-helpers/index.ts` | mostly dead code — confirm before touching |
| `flowState` | `components/sidebar/right-sidebar.tsx` | main FSM panel |
| `flowState` | `lib/hooks/use-debug.ts` (+ `.test.tsx`) | debug hook — may be dead |
| `flowEvents` | `components/chat/chat-messages.tsx` | |
| `isGenerating` / `firstTokenReceived` | `components/ui/send-button.tsx` | |
| `isGenerating` / `firstTokenReceived` | `components/messages/message-actions.tsx` | |
| `isGenerating` / `firstTokenReceived` | `components/messages/message.tsx` | |
| `isGenerating` / `firstTokenReceived` | `components/chat/chat-input.tsx` | |
| `isGenerating` / `firstTokenReceived` | `components/chat/chat-hooks/use-scroll.tsx` | |
| `isGenerating` / `firstTokenReceived` | `components/chat/chat-hooks/use-chat-history.tsx` | |
| `thinkingLog` | `components/messages/message.tsx` | keyed by message id — collision-free across chats |

## Proposed approach

1. Land channels with the legacy-context mirror in place (first delivery).
2. Introduce a thin read hook, e.g. `useViewedChannel(selector)`, so consumers
   migrate to `useViewedChannel(c => c.messages)` rather than importing store
   internals directly — keeps the store shape swappable.
3. Migrate consumers group by group (messages → status → FSM panel), verifying
   each in the app (see `.claude/skills/verify`) before deleting that field's
   mirror.
4. Once a field has no remaining context consumers, remove it from the
   viewed-channel mirror and from `ChatbotUIContext`.

## Open questions

- Does `chat-helpers/index.ts` / `use-debug.ts` still have live consumers, or
  are they dead code that should just be deleted rather than migrated?
  (Cross-check with memory note on `chat-helpers/index.ts` being mostly dead.)
- Should `useViewedChannel` also expose a `useChannel(chatId, selector)` variant
  up front, so the sidebar's per-chat "generating" badge can be built during the
  migration rather than after?