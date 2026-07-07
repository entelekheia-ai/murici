# Plan 004: Chat Handler Strategy Pattern

## Objective
Deconstruct the monolithic `use-chat-handler.tsx` and `chat-helpers/index.ts` files into a clean Strategy Pattern.

## Motivation
`use-chat-handler.tsx` is over 600 lines, and `chat-helpers/index.ts` is over 900 lines. They mix logic for standard chat, local chat, hosted APIs, and flow-based FSM chat (`handleFlowChat`). This makes it extremely fragile to modify and hard to read.

## Proposed Approach
1. Define a standard interface: `IChatStrategy` with methods like `sendMessage`, `stopMessage`, etc.
2. Create concrete implementations: 
   - `AgentChatStrategy` (handles FSM `[FLOW_CONTEXT]`, intents, effects).
   - `StandardChatStrategy` (regular LLM chat).
3. The React hook `useChatHandler` will simply instantiate the correct strategy based on the current context and delegate the calls.

## Open Questions
- Should the strategies be pure Vanilla TS classes, or React hooks themselves? (Vanilla classes are preferred to decouple from React lifecycle).
