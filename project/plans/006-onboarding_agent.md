# Murici Onboarding & Support Agent

This plan details the implementation of a native helper agent (`onboarding-agent`) for Murici. It will act as the first point of contact for new users, presenting the main features with accessible language for the general public, but containing enough technical information to guide developers.

## User Review Required

> [!IMPORTANT]
> The automatic injection on the **first run** still needs to be defined in the UI. We need to ensure the UI loads this package by default when IndexedDB is empty, without relying on manual drag-and-drop.
> 
> **CSS Scope Persistance:** ⚠️ **SUPERSEDED by Plan-017.** The current `applyKernelCss` injects styles globally. If the user is in the middle of the tutorial and switches to another conversation, the tutorial styles (like the orange background) will "leak" to the other chat. We need to tie the CSS state to the active conversation. The `active_css`/IndexedDB/`use-chat-handler.tsx` approach described here and in "Feasibility Analysis: `apply css`" below predates ADR-0007 (per-thread channels) — the actual fix lives in Plan-017, which scopes presentation effects per `threadId` in the channel store (in-memory) and reconciles the viewed thread's set into the DOM.

## Open Questions

1. **Auto-loading:** What will be the exact UI trigger to load the `onboarding-agent`? Should we use a `useEffect` in the workspace layout or `use-chat-handler.tsx` that checks for an empty IndexedDB and fetches the `.agent` package from a `public/default-agents` folder?

## Status (2026-07-03)

- **`main.behavior` + `onboarding.behavior` split — implemented and verified.** `main.behavior` merges `"onboarding.behavior"` at the top; `init` became a dispatcher (`if context.onboarding == true / transition to onboarding / else / transition to responsive / end`). The `onboarding` state is in `main.behavior`, while `onboarding.behavior` holds the linear continuation (`onboarding.agent_format` → `onboarding.features_graph` → `onboarding.mcp_setup` → `wrap_up`). `wrap_up` sets `context.onboarding = false` and offers `on intent "explore" transition to responsive`.
  - Ran `node dist/cli.js pack --dir murici/agents/onboarding-agent` successfully: **clean build, zero errors, zero warnings.**
- **Privacy copy (Decision 1) — applied.** `knowledge/features.md` §1 rewritten to focus on the ability to run locally (Ollama/LM Studio).
- Softening of "hallucination-proof", trust note in `mcp-setup.md`, and rewrite of `main.description` — all applied.

### Unblocked: Frontend Hooks & CSS are Implemented

Contrary to earlier assumptions, the required frontend UI hooks and CSS files are **already implemented** in the codebase:
- `lib/kernel-effects.ts` correctly handles `run_script` for `"open_agents_panel"`, `"open_settings_auto_task"`, and `"open_mcp_config"`, routing them to the appropriate UI dispatches.
- The UI selectors (`data-dot-id="auto-task-model"` in `profile-settings.tsx` and `data-dot-id="agent-panel"` in `right-sidebar.tsx`) exist.
- The CSS files (`highlight-models.css` and `theme-system.css`) exist in `public/agent-styles/`.
- `applyKernelCss` and `removeKernelCss` dynamically inject `<link>` tags pointing to these styles.

What is currently missing is the React Context integration to persist these styles strictly per-conversation, as described below.

## Content Strategy and UX

- **Target Audience:** General public. Simple language, no software engineering jargon on the surface, but with direct paths for advanced configuration (CLI, MCP).
- **No Fork History:** The agent will not talk about "absences" (like "we don't use Supabase"). It describes Murici as it is today: a self-sufficient and secure client.
- **`.agent` Format:** SCXML will not be detailed. The format will be presented as a *portable packaging standard for AI Agents*, focusing on how it helps and guides the LLM safely.

---

## Feasibility Analysis: `apply css` (Dynamic and Chat-Local Theming)

> [!WARNING]
> The implementation steps in this section (IndexedDB `active_css`, `use-chat-handler.tsx`, `selectedChat` observer) are **superseded by Plan-017**. They describe the pre-ADR-0007 architecture. Kept here for historical context only.

> [!NOTE]
> `apply css` receives a file path, not a loose class name. The CSS files (`css/highlight-models.css`, `css/theme-system.css`) already exist in `public/agent-styles/`. 

Using `apply css` to inject a distinct theme (e.g., a stylized dark-mode/light-mode) exclusively for the system agent is **100% feasible and excellent for UX**. More importantly, the effect must be **"local" to the chat that invoked it** (applying to the whole app, but reverting to normal if the user clicks on another conversation).

To make this persistent and enable smooth transitions between tabs, we will add the following steps to the development:

1. **In the Data Layer (IndexedDB / Typing):**
   - Add an optional property (e.g., `active_css: string[]`) to the `Chat` object interface saved in the local database.
2. **In the FSM Handler (`use-chat-handler.tsx`):**
   - When receiving the `apply_css` effect from the DSL, we inject this value into the `active_css` array of the current `selectedChat` and save it to IndexedDB. The reverse occurs with `remove_css`.
3. **In the App Root Container (e.g., Root Layout or wrapper):**
   - Create an observer (via React Effect) that "watches" the conversation change (`selectedChat?.active_css`).
   - When the user enters the agent's chat, the code injects the active CSS links. When they switch to a normal chat, the observer clears these links, triggering the transition back to the default theme.

### Feasibility Analysis: Interactive UI Triggers (`run script` and CSS Tooltips)

Guiding the user visually by pointing to and opening interface elements is a fantastic idea and is already supported by the current FSM Engine:

- **CSS Tooltips with Pseudo-elements (`apply css`):** Highly efficient. The kernel emits `apply css "highlight-models.css"`. This injects the stylesheet which targets `[data-dot-id="auto-task-model"]::after` with the tooltip.
- **Opening Side Panels (`run script`):** The kernel emits `run script "open_agents_panel"`. `lib/kernel-effects.ts` intercepts this and dispatches a React state update to open the right panel.
- **MCP Auto-configuration via Agent:** We use `run script "open_mcp_config"` to open the configuration UI, delegating deep setup automation to specialized agents in the future.

---

## Proposed Changes

The onboarding agent package is built in `agents/onboarding-agent`. (Note: `main.behavior` and knowledge files are already present).

### 1. FSM & Routing Logic (`agents/onboarding-agent/main.behavior`)
Orchestrates the conversation through well-defined states (`init`, `local_models`, `agent_format`, `features_graph`, `mcp_setup`, `support_fallback`).

### 2. Knowledge Base (RAG)
Specific markdown files are mapped via the `teach` effect:
- `knowledge/local-models.md`
- `knowledge/dot-agent-format.md`
- `knowledge/features.md`
- `knowledge/mcp-setup.md`

## Verification Plan

### UI/Engine Modifications
- Implement the `active_css` array in the React Context to capture `apply_css`.
- Create the observer component to mount/unmount styles based on `selectedChat`.

### Onboarding Agent
- Test initial loading (Zero-State) to drop the file automatically when opening the app with no history.
- Switch between a regular chat and the onboarding chat to verify that styles are applied and removed smoothly without leaking.
