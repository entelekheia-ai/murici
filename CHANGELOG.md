# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.10.0] — First public release

### Added

- Per-thread chat channels: each chat runs as an independent channel with its own stream and
  its own agent session, so multiple chats can generate in parallel without leaking state into
  each other.
- `.agent` (dot-agent) integration: load and run deterministic FSM agents, with a live state
  debug panel, MCP tools, and built-in tools.
- "Agents" panel for recent/previously loaded agent bundles.
- Cross-platform Electron packaging: signed and notarized macOS builds, Windows, and Linux.

### Known limitations

- A malformed tool call from a weak model (e.g. Llama-3.2-1B) can poison a chat's history —
  every subsequent turn in that chat then fails with a 422. Workaround: start a new chat and
  switch to a stronger model (7B+). See [README § Known Limitations](README.md#known-limitations).
