# RFC: Local Model Autodiscovery in Murici

> **Implementation status** — see [RFC-0001](./0001-local-model-autodiscovery.md) for the formal spec and decisions.
>
> | Section | Status |
> |---|---|
> | §3.1 Port Polling | ✅ Implemented (RFC-0001 Phase 1) |
> | §3.2 Config File Scanning (oMLX) | ✅ Implemented (RFC-0001 Phase 1) |
> | §6.1 Discovery Engine | ✅ Implemented (RFC-0001 Phase 1) |
> | §6.2 Frontend Integration | ✅ Implemented (RFC-0001 Phase 1) |
> | §4 Lifecycle Management / Orchestration | ⏳ Phase 2 |
> | §4.3 Memory Management | ⏳ Phase 2 |

## 1. Context and Motivation

Currently, Murici supports local models (like Ollama) primarily through fixed configuration via environment variables (e.g., `NEXT_PUBLIC_OLLAMA_URL`). While functional, this approach requires manual setup by the user.

With the proliferation of local inference engines (Ollama, LM Studio, Llama.cpp, LocalAI, vLLM, oMLX), users frequently switch between tools or run multiple servers. An **Autodiscovery Mechanism** would provide a seamless, "zero-configuration" experience by automatically detecting running AI servers on the user's machine and integrating their available models into the chat UI.

## 2. Goals

- **Zero-Config Setup:** Automatically detect models from popular local inference servers without requiring the user to enter URLs or ports.
- **Broad Compatibility:** Support both Ollama's native API and the de-facto standard OpenAI compatible APIs (`/v1/models`).
- **Responsive UI:** The discovery process should be fast and non-blocking, avoiding long timeouts if a server is offline.
- **Clear UX:** Auto-discovered models should be easily identifiable in the model selection menu.

## 3. Autodiscovery Strategies

To maximize the chances of finding local models, the discovery engine will use a hybrid approach: prioritizing active port polling, but falling back to (or supplementing with) configuration file scanning.

### 3.1 Port Polling (Active Discovery)

The primary method is to probe a predefined list of well-known ports and endpoints on `localhost`:

| Server / Engine | Default Port | Endpoint | API Format |
| :--- | :--- | :--- | :--- |
| **Ollama** | `11434` | `/api/tags` | Native |
| **LM Studio** | `1234` | `/v1/models` | OpenAI Compatible |
| **LocalAI** | `8080` | `/v1/models` | OpenAI Compatible |
| **Llama.cpp** (Server) | `8080` | `/v1/models` | OpenAI Compatible |
| **vLLM** | `8000` | `/v1/models` | OpenAI Compatible |
| **Oobabooga** | `5000` | `/v1/models` | OpenAI Compatible |
| **oMLX** | `8000` | `/v1/models` | OpenAI Compatible |

### 3.2 Configuration File Scanning (Passive Discovery)

While port polling covers the default cases, users often change ports. We explored whether we could read configuration files to find custom ports. Our research shows that **oMLX** is currently the only engine with a readily accessible plaintext config file for server settings. 

**Configuration Behavior by Engine:**

| Engine | Config Storage Method | Can we read the port? | Location / Notes |
| :--- | :--- | :--- | :--- |
| **oMLX** | `settings.json` | ✅ **Yes** | `~/.omlx/settings.json`. Contains `server.port` and `server.host`. Extremely reliable for discovery. |
| **Ollama** | Environment Variables | ❌ **No** | Uses `OLLAMA_HOST` env var or `launchctl` (macOS). The `~/.ollama` folder only stores models and logs, not the port configuration. |
| **LM Studio** | Internal DB / CLI args | ❌ **No** | Port is configured via the GUI (saved in internal app state/DB) or via `--port` in the `lms` CLI. No plaintext `settings.json` exists for the port. |
| **vLLM / Llama.cpp** | CLI arguments (`--port`) | ❌ **No** | Run directly via terminal. State is ephemeral and not saved to a global config file. |
| **LocalAI** | CLI arguments / Env | ❌ **No** | Configured via `--address` or env vars upon container/binary startup. |

*Actionable Takeaway for Murici:* We will implement passive scanning **specifically for oMLX** by reading `~/.omlx/settings.json`. For the other engines, we must rely strictly on active port polling (Section 3.1) or allow the user to manually input a custom URL in Murici's settings if they deviated from the defaults.

## 4. Lifecycle Management (Orchestration)

Beyond simply discovering *running* models, Murici can take a proactive role in managing the engines themselves. If an engine (like oMLX or Ollama) is installed but not currently running, Murici can orchestrate its lifecycle.

### 4.1 Orchestration Flow

1. **Binary Detection:** Before probing ports, check if common binaries exist in the system `PATH` (e.g., `which ollama`, `which omlx`, `which lms`) or in default install paths.
2. **Status Check:** Perform the standard active port polling (Section 3.1).
3. **Auto-Start:** If the port is dead but the binary is found, Murici (via a Node.js `child_process`) can automatically spawn the engine in the background.
4. **Auto-Shutdown (Optional):** When Murici is closed, it can gracefully terminate the child processes it spawned, ensuring no zombie processes are left draining the user's battery or RAM.

### 4.2 Engine-Specific Start Commands

| Engine | Start Command | Notes |
| :--- | :--- | :--- |
| **oMLX** | `omlx start` | Spins up the managed background server. |
| **Ollama** | `ollama serve` | Starts the Ollama API server. |
| **LM Studio** | `lms server start` | Starts the local server via the `lms` CLI. |

### 4.3 Memory Management (Load/Unload/Swap)

Since local LLMs consume significant RAM/VRAM, Murici should proactively tell the underlying engines to unload models when they are idle (e.g., app loses focus or after X minutes of inactivity) and handle hot-swapping between models.

**Unload/Swap Capabilities by Engine:**

| Engine | Explicit Unload API | Hot-Swapping | Idle Auto-Unload | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Ollama** | ✅ `POST /api/chat` (`keep_alive: 0`) | ✅ Native | ✅ Native (default 5m) | Easiest to manage. Murici can send a 0-keep-alive request to free VRAM immediately. |
| **LM Studio** | ✅ `POST /api/v1/models/unload` | ✅ Native | ✅ Configurable | Requires API v1 (v0.4.0+). Murici must fetch `instance_id` first. |
| **Llama.cpp** | ✅ `POST /models/unload` | ✅ Router Mode | ✅ `--sleep-idle-seconds` | Only works if the server is started in "Router Mode" (`--models-dir`). |
| **oMLX** | ➖ Handled internally | ✅ Native | ✅ Configurable | Focuses on tiered Hot/Cold cache. Swaps automatically. Idle timeout set in `settings.json`. |
| **vLLM** | ❌ No | ❌ Requires Restart | ❌ No | Designed for static high-throughput serving, not desktop hot-swapping. |

*Actionable Takeaway:* For supported engines (Ollama, LM Studio, Llama.cpp), Murici will implement a "Sleep Mode" that calls their respective unload endpoints when the chat is idle for a user-defined threshold, instantly recovering system memory.

*Note: This feature transforms Murici from a passive client into an all-in-one local AI manager, significantly lowering the friction for non-technical users.*

## 5. API Feature Matrix & Scope Limit

To ensure Murici remains a robust, uncoupled client, we evaluated the API surfaces of all target engines to determine which features are universally supported and should be included in the PoC.

| API Feature | Ollama | LM Studio | oMLX | Llama.cpp | LocalAI | vLLM |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **List Models (`GET /v1/models`)** | ✅ Yes¹ | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Chat (`POST /v1/chat/completions`)** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Embeddings (`POST /v1/embeddings`)** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Function Calling (Tools)** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Vision (Multimodal)** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Explicit Unload Model** | ⚠️ Specific² | ⚠️ Specific³ | ❌ Auto | ⚠️ Specific⁴ | ❌ Auto | ❌ No |
| **Download/Delete Model Dynamically** | 🌟 Native | ❌ GUI/CLI | ❌ CLI | ❌ No | 🌟 Native | ❌ No |
| **Hardware Metrics (VRAM via API)** | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |

*Notes:*
¹ Ollama recently added `/v1/models` compatibility; historically used `/api/tags`.
² Ollama uses `keep_alive: 0` in chat requests.
³ LM Studio uses a proprietary `/api/v1/models/unload` endpoint.
⁴ Llama.cpp uses a proprietary `/models/unload` endpoint in Router Mode.

**Scope Limit for PoC:**
Murici will rely **exclusively** on universal endpoints (`/v1/models`, `/v1/chat/completions`, `/v1/embeddings`) for core operations. We will *not* build a native model downloader (App Store) or VRAM metrics dashboard for the PoC, as these require engine-specific implementations. However, as noted in Section 4.3, we *will* implement conditional Memory Management (unloading) for engines that support it, as this heavily impacts UX.

## 6. Proposed Architecture

### 6.1 Discovery Engine (Backend)

Since Murici runs as a Next.js server (and is embedded inside Electron), the discovery logic should run server-side. This avoids browser CORS restrictions that might occur if the local inference server hasn't configured permissive CORS headers, and allows access to the local file system.

1. **New API Route:** Create `app/api/models/discover/route.ts`.
2. **Config Parsing:** Read local config files (e.g., `~/.omlx/settings.json`) to identify any custom ports/URLs.
3. **Binary Management:** Check for installed binaries (`ollama`, `omlx`) and start them if they are not running.
4. **Parallel Probing:** The route will dispatch parallel `fetch` requests to the known default endpoints AND any custom endpoints discovered via config parsing.
5. **Aggressive Timeouts:** Use `AbortController` to enforce a short timeout (e.g., 500ms - 1000ms) for each request to ensure the discovery returns quickly.
6. **Aggregation & Normalization:** Map the diverse responses into a unified `LLM` array (matching Murici's `types/models.ts` structure), tagging them with the detected provider (e.g., `ollama`, `lm-studio`, `local-openai`, `omlx`).

### 6.2 Frontend Integration

1. **State Management:** Update the global state (`components/utility/global-state.tsx`) or context to hold `discoveredModels`.
2. **Model Fetching:** Modify the existing model fetching logic (in `lib/models/fetch-models.ts` or similar) to call the new `/api/models/discover` endpoint alongside existing cloud models.
3. **Model Select UI:** Update `components/models/model-select.tsx` to group these models under a "Local (Auto-discovered)" category or group them by their detected engine.
4. **Manual Refresh:** Provide a "Refresh Local Models" button in the model selector or settings, as users might start their inference server *after* opening Murici.

## 7. Implementation Steps

### Step 1: Define the Discovery Service
Create the core probing logic. This function will take a list of configurations (port + path), make fast requests, and catch `ECONNREFUSED` or timeout errors gracefully.

### Step 2: Implement Orchestration (Optional/Phase 2)
Add `child_process` logic to detect and spawn tools like `omlx start` or `ollama serve` if their ports are dead.

### Step 3: Build the Next.js API Route
Expose the discovery and orchestration service via an API endpoint so the React frontend can consume it without CORS issues.

### Step 4: Update `fetch-models.ts`
Integrate the discovery API call into the application's startup/refresh flow, appending the results to the list of available models.

### Step 5: UI Updates
Adjust the model selector dropdown to accommodate the new models, ensuring they have appropriate icons (e.g., a generic "chip" or "laptop" icon for local models) and clear names.

## 8. Open Questions & Edge Cases

- **Duplicate Resolution:** If a user explicitly configures `NEXT_PUBLIC_OLLAMA_URL=http://localhost:11434` and we also auto-discover it, how do we deduplicate? *(Proposed: Match on `provider` and `modelId` and merge).*
- **Polling vs. On-Demand:** Should Murici poll for local models in the background, or only discover them on startup and when manually refreshed? *(Proposed: On startup and manual refresh to avoid unnecessary background network noise).*
- **Custom Ports:** Some users run these tools on non-standard ports. We should still provide a way in the settings UI to manually add a custom "OpenAI Compatible Endpoint" or "Ollama Endpoint" to cover cases the autodiscovery misses.
