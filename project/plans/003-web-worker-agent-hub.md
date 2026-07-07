# Plan 003: Web Worker Agent Hub (User & Runtime Agents)

## Objective
Transition the dot-agent kernel execution entirely to the browser via Web Workers, deprecating server-side execution, and supporting multiple agent profiles (User and Runtime).

## Motivation
To make the codebase vanilla-friendly and browser-first, FSM logic must run client-side. The legacy server endpoints (`/api/agent/kernel/*`) are to be deprecated. Furthermore, the system needs to support two agent archetypes:
1. **User Agents**: Interactive, instantiated by the user in the chat UI.
2. **Runtime Agents**: Headless, background agents performing systemic services (e.g., `enrich`).

## Proposed Approach
1. Refactor `worker/fsm.worker.ts` into a hub that can spawn and manage multiple sessions independently.
2. Create `lib/runtime/runtime-agent-manager.ts` (pure TS/Vanilla) to orchestrate background "enrich" tasks without touching React state.
3. Update `lib/kernel-proxy.ts` to route all FSM effects purely to the worker.
4. Deprecate and remove server-side FSM execution routes.

## Open Questions
- How should Runtime Agents report progress? Should they emit events to a separate Zustand store or trigger toasts in the UI?
