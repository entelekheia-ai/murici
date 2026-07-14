# Plan 015: Future Agent Topology (subagents, system observers, multi-agent)

> **Status:** briefing / tracking doc. Nothing here is being built now. This exists so the
> channel architecture ([ADR-0007](../adr/0007-per-thread-chat-channels.md)) is *shaped* to
> accept these without a rewrite, and so the placeholder comments left in the code have a
> single place to point at.

## The hierarchy (agreed)

```
1 chat (thread)
 └── N agents                     ← today always 0..1; N is the future
      └── 1 subchat : 1 subagent  ← a subagent always owns exactly one subchat
```

Plus two things that sit *outside* that tree:
- **Headless / system agents** — already exist today. Run a kernel + call the LLM in the
  background for systemic tasks. No user interaction, no UI, no thread of their own.
- **System observer agents** — future. Attached to a *user's* chat, watching its history.

## The three concepts (from ADR-0007)

The channel refactor deliberately separates what is currently fused:

| Concept | What it is | Key | Today |
|---|---|---|---|
| **Thread** | message history + UI surface (a chat **or** a subchat) | `threadId` | `threadId == chatId` |
| **Agent session** | the kernel/FSM instance | `agentSessionId` | one per chat, keyed by chatId |
| **Invocation** | one LLM call in flight; belongs to a session, targets a thread | — | exactly one per thread at a time (`useChat`) |

Everything below is expressed in that vocabulary.

## The cases, and what each one needs

### H1 — Subagents (an agent delegates to another agent)

**Fits the current model with no rework.** Because the rule is 1 subchat : 1 subagent, a
subchat is simply *another thread* in the store's `channels` record, with exactly one agent
session attached — i.e. a perfectly ordinary channel. What's needed when we build it:

- Mint a `threadId` for the subchat and an `agentSessionId` for the subagent; persist the
  parent↔child link (a `parentThreadId` on the subchat record).
- A delegation tool (the parent agent calls something like `delegate_to(agent, task)`), which
  creates the subchat + session and starts an invocation on it.
- **Open question — cross-stream visibility:** can a subagent *read* the parent's (or a
  sibling's) stream? Architecturally this is now a **policy**, not plumbing: the Zustand store
  holds every channel, so `channels[parentThreadId].messages` is readable by any controller.
  Decide it as a permission (per delegation? per agent manifest?), not as a data-plumbing
  problem.
- UI question: is a subchat visible to the user as its own thread, nested under the parent, or
  hidden/collapsed by default?

### H2 — System observer agents (e.g. auto-compactor)

**This is the case that does NOT fit today's per-thread `useChat`.** An observer is an agent
session attached to the *user's* thread, doing its own LLM call *while the user's own turn may
also be streaming* — i.e. **two concurrent invocations on one thread**. `useChat` is one
conversation with **one request in flight at a time**, so the observer cannot ride the thread's
primary channel.

What's needed when we build it:
- An **additional-invocation** concept in the vanilla channel controller (the seam ADR-0007
  deliberately left): an invocation that targets a thread but does **not** occupy that thread's
  primary `useChat`. Likely a separate, headless stream (the same machinery the existing
  headless/system agents already use) whose output is *not* projected as a normal assistant
  message.
- A **write/mutation contract** for the message history: observers may *extract*, *add*, or
  *rewrite* history (compaction rewrites it). Today the projection is one-way
  (SDK → `chatMessages`), so a second writer needs an agreed order of precedence and a story
  for what happens if the user's stream is projecting while the compactor rewrites — the store
  is the single place that arbitration would live.
- Constraint stated up front: **observers do not talk to other agents.** They read/mutate the
  thread; they don't form an agent-to-agent graph.

### `@name` multi-agent in one chat (someday)

Same shape as H2 — N agent sessions on **one** thread — so it inherits the same
additional-invocation requirement, plus:
- Routing: which session receives a given user turn (`@name` prefix → `agentSessionId`).
- The thread's `agentSessionIds: string[]` (already modelled as a list in ADR-0007, length 0..1
  today) becomes genuinely N.
- Presentation: which agent "owns" a rendered message; the FSM panel must show N sessions.

### Headless / system agents (already exist)

Confirms the design: an invocation can exist with **no thread and no viewed channel at all**.
This is why the live-set rule in ADR-0007 says *"any invocation in flight"* rather than *"the
user sent something"* — a headless agent's LLM call is an invocation like any other.

## What was shaped now (cheap), so this stays additive

Done as part of the channels work, purely as naming/keying discipline — no future behavior built:

1. Channels keyed by a generic **`threadId`**, not "the top-level chat id" → subchats slot in.
2. Agent sessions are a **separate entity with their own `agentSessionId`**, referenced by the
   thread as a **list** (`agentSessionIds`, length 0..1 today) → N agents becomes additive.
3. The vanilla controller is modelled as **"an invocation targeting a thread, driven by an agent
   session"** → an *additional* invocation (observer / multi-agent) is an add-on in the
   controller, not a rewrite of the primary channel or of `useChat`.

Code touched by this shaping carries a comment pointing here.

## Open questions (to resolve when each case is actually picked up)

- Cross-stream visibility for subagents: opt-in per delegation, per agent manifest, or never?
- Are subchats first-class in the UI (own sidebar entry) or nested/hidden under the parent?
- Message-history mutation by observers: what arbitrates against a concurrent user stream?
- Does an observer's invocation get its own `agentSessionId` + persisted bundle, or is it a
  system agent registered globally and merely *pointed at* a thread?
- When dot-agent ships kernel-state serialization (backlog), does a subagent's session persist
  and revive with its subchat, or is it always ephemeral?
