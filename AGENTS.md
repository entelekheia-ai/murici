# Murici — Agent Guidelines

Murici is a Next.js + Electron chat app that runs `.agent` behaviours: a deterministic state machine,
executed by the `@dot-agent/sdk` WASM kernel, decides where a conversation goes, and the model only signals
intent. It is a fork of [`mckaywrigley/chatbot-ui`](https://github.com/mckaywrigley/chatbot-ui) (MIT),
relicensed Apache-2.0 with dual attribution — see [`NOTICE`](NOTICE).

The `@dot-agent/*` packages are pinned to exact versions from npm (`package.json`). Their
language reference is the [dot-agent platform](https://github.com/dot-agent-spec/platform), not this repo.

## Source of truth

| What | Where |
|---|---|
| Architecture decisions (sessions, turn loop, channels, streaming errors) | [`project/adr/`](project/adr/) — 0007 (per-thread channels) is the current shape |
| Persona, rules and per-turn FSM text sent to the model | [`lib/runtime/dot-agent-injector.ts`](lib/runtime/dot-agent-injector.ts) |
| The `trigger_intent` tool actually sent | [`lib/tools/registry.ts`](lib/tools/registry.ts) (`buildTriggerIntentTool` in the injector only feeds the sidebar) |
| The turn loop: tool call → `send_intent` → effects | [`lib/channels/channel-controller.ts`](lib/channels/channel-controller.ts) (`onToolCall`) |
| Per-thread status, flow events, active CSS | [`lib/store/channel-store.ts`](lib/store/channel-store.ts) |
| IndexedDB schema (`"entelekheia"`) | [`lib/local-db/schema.ts`](lib/local-db/schema.ts) |
| Effect types | [`types/kernel-effect.ts`](types/kernel-effect.ts), hand-mirrored from the kernel's `src/effect.rs` |
| Release, branches, license headers, running from source | [`CONTRIBUTING.md`](CONTRIBUTING.md) |

## How this repo works

The invariants — what breaks the worker, the channels, the injector, streaming, persistence and the
packaged app — are [`.agents/rules/repo-guardrails.md`](.agents/rules/repo-guardrails.md), always loaded.
Governance records (`project/`) follow [`.agents/rules/governance.md`](.agents/rules/governance.md) and are
opened and closed with the `vibe-ops` plugin.

| Electron | |
|---|---|
| Server | Packaged builds run the Next.js standalone server via `utilityProcess.fork` on a free `127.0.0.1` port ([`electron/next-server.ts`](electron/next-server.ts)). LLM calls go through it, not IPC. |
| Release channels | Driven by the git tag; `electron/updater.ts` derives the channel from the build's version. Fixes go to `main`, features to `alpha`, promoted `alpha` → `beta` → `main`; `main` is forward-ported into each channel automatically. Every PR carries a `.changeset/*.md` (`--empty` when nothing ships), and `CHANGELOG.md` is generated. **Never tag a prerelease off `main`.** Procedure: [`CONTRIBUTING.md`](CONTRIBUTING.md). |

## Agent config

Rules and skills live in `.agents/` (`rules/<name>.md`, `skills/<verb>/SKILL.md`); `.claude/rules/` and
`.claude/skills/` hold relative symlinks to them. Never put the real file under `.claude/`. To verify a UI
or chat change, use the `verify` skill; to debug an agent that does not move, see
[`docs/how-to/troubleshoot-agent-transitions.md`](docs/how-to/troubleshoot-agent-transitions.md).

## Keeping this file current

Update this file as part of any task that changes what it describes:

- a file named in *Source of truth* moves or is renamed;
- an ADR is added or supersedes 0007;
- an invariant in `repo-guardrails.md` stops holding, or a new "this breaks if…" is found (edit the rule);
- the worker, the injector, the channel controller or the chat routes change shape;
- an IndexedDB store is added, or the Electron server/updater mechanics change.

Adjust the one affected line, keep entries short, and mention the edit in the task's summary.
