<p align="center">
  <img src="docs/images/header.png" alt="Murici" width="800">
</p>

<h1 align="center">Murici</h1>

<p align="center">
  <strong>A lightweight desktop chat UI for running deterministic state-machine agents.</strong><br>
  Built on the <a href="https://github.com/dot-agent-spec/platform"><code>.agent</code></a> standard: drag a bundle onto the window and watch the run as it happens.
</p>

<p align="center">
  <a href="https://github.com/entelekheia-ai/murici/releases"><img src="https://img.shields.io/github/v/release/entelekheia-ai/murici?label=release" alt="Latest release"></a>
  <a href="license"><img src="https://img.shields.io/badge/license-Apache--2.0%20%2B%20MIT-blue.svg" alt="Apache-2.0 and MIT"></a>
  <a href="https://github.com/entelekheia-ai/murici/releases/latest"><img src="https://img.shields.io/badge/desktop-Electron-47848F?logo=electron&logoColor=white" alt="Electron desktop"></a>
</p>

<p align="center">
  <a href="https://github.com/entelekheia-ai/murici/releases/latest">Download</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#known-limitations">Known limitations</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="https://entelekheia.ai">entelekheia.ai</a>
</p>

![Murici running the Fridge Assistant agent: the conversation on the left, and on the right the agent's state history — responsive marked done, show_catalog in progress, and the remaining states still pending.](https://github.com/entelekheia-ai/.github/raw/main/assets/murici.png)

## Why

A chat with an LLM agent is usually something you infer: you read the answers and guess which step the
agent thinks it is on. Murici makes it something you watch. The panel on the right tracks the run as it
happens — which states are done, which one is executing, which are still ahead — alongside the agent's own
description and its execution graph.

## How it works

Routing is deterministic. An `.agent` bundle declares a state machine; the model signals intent through a
`trigger_intent` tool call, a WASM kernel ([`@dot-agent/sdk`](https://github.com/dot-agent-spec/platform/tree/main/packages/sdk))
decides the transition, and the interface updates from the effects it returns — goal, guide and teach
instructions for the model, transitions for the panel. The model never decides where the conversation goes
on its own, and no control tokens leak into the chat.

- **Drag and drop.** Drop an `.agent` bundle (packed with
  [`dot-agent-cli`](https://github.com/dot-agent-spec/platform/tree/main/apps/dot-agent-cli)) onto the
  window and it compiles and starts. Recently used agents are kept so a chat can be resumed.
- **Any model.** Hosted providers and locally discovered LLM servers (Ollama, or any OpenAI-compatible
  endpoint) connect on the same footing.
- **Local only.** Chats, models, keys and agents live in IndexedDB on your own machine. There is no account
  and no server to sign into.
- **Reasoning kept apart.** A model's `<think>` output is shown in a collapsible block, never mixed into the
  answer.

## Install

Download the installer for macOS or Windows from the
**[latest release](https://github.com/entelekheia-ai/murici/releases/latest)**.

To run from source, see [CONTRIBUTING.md](CONTRIBUTING.md#running-from-source).

## Known limitations

### A malformed tool call from a weak model can poison a chat

Agent flows depend on the model emitting a well-formed `trigger_intent` tool call. Small
quantized models (e.g. **Llama-3.2-1B**) reliably fail at this: they emit a tool call with
`name: "unknown"` and `arguments` as a JSON **list** instead of an object.

Murici has no sanitation for that yet, so the broken assistant message stays in the chat's
history and **every subsequent turn in that chat fails** — the model server rejects its own
malformed history with a `422` (`arguments must be a JSON object, got list`).

**Symptom.** A chat that worked suddenly answers nothing, and the console shows a repeated
422 / `NoOutputGeneratedError`.

**Workaround.** Start a new chat and **switch to a stronger model**. Anything in the 7B+ range
(or a hosted model) handles tool calling correctly. Reserve tiny models for plain chat, without
an `.agent` loaded.

Tracked in [#1](https://github.com/entelekheia-ai/murici/issues/1).

## License

Apache License 2.0, with portions from [Chatbot UI](https://github.com/mckaywrigley/chatbot-ui)
(McKay Wrigley) under the MIT License. Copyright is held by the Murici authors — see [`license`](license),
[`NOTICE`](NOTICE) and [`AUTHORS`](AUTHORS).
