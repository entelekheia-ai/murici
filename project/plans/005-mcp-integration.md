# Plan 005: MCP (Model Context Protocol) Integration

## Objective
Add MCP Client support to Murici, allowing LLMs operating inside Murici to interact with external tools provided by any standard MCP server. 

*(Note: The previously discussed MCP Server capabilities to expose Murici internals have been dropped to focus solely on consumption).*

## Architectural Decisions & Constraints

- **Storage**: MCP Client configurations will be stored locally in a JSON file (`~/.config/murici/mcp.json`) to follow standard OS config patterns and facilitate manual editing. This file will be auto-created if it does not exist. The frontend will access this via new backend API routes.
- **Backend-Driven MCP Client**: To avoid complex bidirectional SSE proxies and browser limitations with `stdio`, the **Next.js Backend (Node.js)** will act as the actual MCP Client. It will spawn local `stdio` processes, maintain SSE connections to remote servers, and expose a simple REST API (`/api/mcp/tools` and `/api/mcp/execute`) for the frontend to use.
- **Frontend Notification Link**: If the MCP backend receives spontaneous notifications (e.g., logs, resources updated), they will be piped to the frontend UI via a dedicated SSE link (`/api/mcp/notifications`).
- **Strict Separation of Tools & Intents**: MCP tools will be mapped standardly and will **never** enter as `trigger_intent` or any other `dot-agent` entrypoint. The `trigger_intent` tool is strictly reserved for the DSL.
- **Internal Tools (Kernel Graph)**: Alongside external MCP tools, Murici will inject an internal tool (`murici://state_graph`) that allows the LLM to retrieve the entire FSM map and its current location. This tool will be intercepted and resolved instantly on the frontend.

## Proposed Changes

### Dependencies

#### [MODIFY] `package.json`
- Add `@modelcontextprotocol/sdk` as a dependency.

---

### Core Data & Configuration

#### [NEW] `types/mcp.ts`
- Define types for `MCPServerConfig` (name, type: 'stdio' | 'sse', command/url, args, env).

#### [MODIFY] `types/database.ts` & `lib/local-db/schema.ts`
- **Context Preservation**: Currently, Murici's `messages` table only saves the final string `content`. `tool_calls` and tool responses are ephemeral. To ensure the LLM remembers its MCP interactions across turns and reloads, we must update the `Message` schema to include `tool_calls` (for assistant messages) and `tool_call_id` (for tool responses), and update the IndexedDB schema accordingly.

#### [NEW] `lib/mcp/config-store.ts`
- Node.js utility to read/write the JSON file at `~/.config/murici/mcp.json`. Ensures the directory and file are created if missing.

---

### Backend MCP Infrastructure (Node.js API Routes)

#### [NEW] `lib/mcp/client-manager.ts`
- A server-side singleton that initializes and caches `Client` instances from the `@modelcontextprotocol/sdk`.
- Reads `config-store.ts` to spawn `stdio` processes or connect to SSE servers.
- Handles listing tools and routing execution requests to the appropriate server.

#### [NEW] `app/api/mcp/config/route.ts` (Node.js runtime)
- `GET`: Returns the contents of `~/.config/murici/mcp.json`.
- `POST`: Saves updates to the configuration.

#### [NEW] `app/api/mcp/tools/route.ts` (Node.js runtime)
- `GET`: Queries the `client-manager.ts` and returns all available tools from active MCP servers.

#### [NEW] `app/api/mcp/execute/route.ts` (Node.js runtime)
- `POST`: Receives a tool call (server name, tool name, arguments), executes it via the `client-manager`, and returns the result.

#### [NEW] `app/api/mcp/notifications/route.ts` (Node.js runtime)
- `GET`: Establishes an SSE connection from the frontend to the backend, pushing spontaneous MCP events (logs, progress) to the React UI.

---

### Frontend & LLM Integration

#### [MODIFY] `components/chat/chat-helpers/index.ts`
- **Tool Fetching**: Fetch external tools via `GET /api/mcp/tools` and append them to the LLM `tools` array.
- **Internal Tool Injection**: Inject a static tool definition for `murici://state_graph` into the `tools` array.
- **Execution Hook**: 
  - If the LLM calls `murici://state_graph`, immediately read `flowState.graph` and return it.
  - If the LLM calls an external MCP tool, call `POST /api/mcp/execute` and feed the `tool_result` back into the LLM context to continue the chat stream.
  - **History Preservation**: Modify `handleCreateMessages` and the state updater to persist the entire `toolExchange` sequence (assistant's `tool_calls` + the tool's response message) into `chatMessages` and the IndexedDB `messages` table, so the LLM retains this context on the next turn.
- **CRITICAL**: Keep all tool execution logic strictly separated from `trigger_intent`. The `trigger_intent` can remain ephemeral/hidden as it is today, but MCP tools must be persisted in the history.

#### [MODIFY] `components/settings/settings-dialog.tsx` (or similar)
- Add a new "MCP Servers" configuration tab. It will use the `/api/mcp/config` routes to let users add, edit, and remove external MCP servers.

---

## Verification Plan

### Automated Tests
- Write unit tests for `lib/mcp/client-manager.ts` to verify tool aggregation, routing, and proper parsing of `mcp.json`.

### Manual Verification
1. **Config Setup**: Add a local `stdio` server via the Settings UI and verify `~/.config/murici/mcp.json` is updated correctly.
2. **Execution Test**: Ask the model to perform an action using the external MCP tool and confirm the UI passes the result correctly to the LLM.
3. **Internal Tool Test**: Ask the LLM "What is the current graph map?" and confirm it correctly calls the `murici://state_graph` tool and interprets the FSM output.
