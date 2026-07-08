<p align="center">
  <img src="docs/images/header.png" alt="dot-agent" width="800">
</p>

# Murici

> A LLM chat runtime with deterministic state-machine behavior routing powered by `@dot-agent/sdk`.

Murici is a lightweight, responsive desktop and web Chat UI designed for running deterministic state-machine agent behaviors. By integrating LLM chat interactions with structured finite state machine (FSM) controls, Murici allows developers to design predictable, goal-driven conversational flows.

---

## Key Features

- **Deterministic Behavior Routing**: Manage chat sessions, goals, styles, and instructions using `@dot-agent/sdk` and `AgentSession` runtimes.
- **Local Model Auto-Discovery**: Automatically scan and connect to local LLM servers (e.g., Ollama or custom local API endpoints) alongside standard hosted APIs.
- **Drag-and-Drop Agent Bundles**: Instantly load and compile behaviors by dragging and dropping `.agent` bundles.
- **SCXML State Graph**: Visually monitor conversation state, visited steps, and active transitions in real time using a custom SVG-rendered state graph parsed from SCXML.
- **IndexedDB Persistence**: Save chat history, settings, and custom models directly in the client database (`idb`), requiring no external database or authentication setup.
- **Electron Desktop packaging**: Easily build standalone binaries (`.dmg`, `.exe`, `.AppImage`) using `electron-builder` for local-first desktop usage.
- **Warm & Modern Aesthetic**: A clean, premium, and unified dark/warm-themed user interface optimized for readability and developer productivity.

---

## Quick Start

### Prerequisites
- Node.js ≥ 18

### Running in Web Dev Mode
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the Next.js development server:
   ```bash
   npm run dev
   ```
3. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Running in Electron Desktop Mode
For desktop development with hot reloading:
```bash
npm run electron:dev
```

To compile production-ready distributable installers:
```bash
npm run electron:build
```
The installers will land in the `dist-electron/` directory.

---

## Persistence

All data is stored locally in the user's browser or Electron renderer process via **IndexedDB** using the [`idb`](https://github.com/jakearchibald/idb) library in a database named `"entelekheia"`.

- **Schema**: `conversations`, `messages`, `customModels`, `settings`.
- **Location**: Implementation is located in [lib/local-db/](lib/local-db/) (with backwards-compatible shims in [db/](db/)).

---

## Behavior Integration

Murici runs deterministic state-machine execution via the `@dot-agent/sdk` monorepo packages.

- Drag-and-drop or copy-paste `.flow` DSL files into the Behavior Panel.
- The state machine directs the conversation via structured instructions (`goal`, `guide`, `teach` effects).
- Intent signaling uses structured tool calling (`trigger_intent`) instead of brittle regex parsing on raw LLM output, preventing control token leakage.
- Detailed transition event timelines and collapsible thinking blocks (`<think>`) are rendered natively in the message thread.

For in-depth architecture details, see [dot-agent.md](./dot-agent.md).  
For developer and agent guidelines, see [AGENTS.md](./AGENTS.md).

---

## License

- Copyright (c) 2026 Danilo Borges — **Apache License 2.0**.
- Portions Copyright (c) 2023 McKay Wrigley — **MIT License**.
- See [`license`](./license) and [`NOTICE`](./NOTICE) for full terms and attributions.

