# Murici

> Chat UI with deterministic FSM-based routing via [dot-agent-kernel](../dot-agent-spec/).

Fork of [`mckaywrigley/chatbot-ui`](https://github.com/mckaywrigley/chatbot-ui) relicensed under Apache 2.0.
Original MIT license and attribution preserved — see [`NOTICE`](./NOTICE).

---

## What's different from upstream

| Upstream (`mckaywrigley/chatbot-ui`) | Murici |
|--------------------------------------|---------|
| Supabase (Postgres + Auth) | IndexedDB — no external backend |
| Vercel deployment | Electron desktop (`.dmg` / `.exe` / `.AppImage`) |
| MIT License | Apache 2.0 (dual attribution, see `NOTICE`) |
| No FSM routing | dot-agent-kernel (Rust/WASM) |

---

## Quick start

**Requirements:** Node.js ≥ 18.

```bash
npm install
npm run dev       # http://localhost:3000
```

### Electron desktop

```bash
npm run electron:dev     # dev with hot reload
npm run electron:build   # production build
```

Distributable artifacts land in `dist/` (`.dmg` on macOS, `.exe` on Windows, `.AppImage` on Linux).

---

## Persistence

All data is stored in **IndexedDB** via the [`idb`](https://github.com/jakearchibald/idb) library, in a database named `"entelekheia"`. There is no external database, no auth, no network dependency for storage.

Schema: `conversations`, `messages`, `customModels`, `settings`.  
Code: `lib/local-db/` (schema + CRUD) — `db/` re-exports for backwards-compatible import paths.

---

## dot-agent integration

Murici validates deterministic FSM-based chat routing using the `dot-agent-kernel` WASM module compiled from [`dot-agent-spec/`](../dot-agent-spec/).

- Paste a `.flow` DSL file into the Agent right panel to load a flow.
- The kernel manages state; the UI reflects transitions in real time via a Mermaid graph.
- Intent signaling uses structured tool calling (`trigger_intent`) — no text parsing.

Full architecture: [`dot-agent.md`](./dot-agent.md).  
Agent coding guidelines: [`AGENTS.md`](./AGENTS.md).

---

## License

Copyright (c) 2026 Danilo Borges — **Apache License 2.0**.  
Portions Copyright (c) 2023 McKay Wrigley — MIT License.  
See [`license`](./license) and [`NOTICE`](./NOTICE).
