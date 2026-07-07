# Plan 001: Zustand State Migration

## Objective
Migrate the massive FSM-related state (`flowEngine`, `flowEvents`, `flowState`, `thinkingLog`) out of the monolithic `ChatbotUIContext`.

## Motivation
The current `context.tsx` and `global-state.tsx` mix UI state (themes, sidebars) with deep agent kernel state. This causes unnecessary re-renders across the entire React tree and makes the FSM context harder to decouple for vanilla JS usage.

## Proposed Approach
1. Install `zustand`.
2. Create `lib/store/agent-store.ts`.
3. Move FSM states out of `context.tsx`.
4. Update UI components (like the right panel graph) to subscribe only to the slices of state they need via `useAgentStore(state => state.flowState)`.

## Open Questions
- Should we migrate *all* chat state (like messages) to Zustand, or just the Agent/FSM specific state for now?
