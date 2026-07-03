# The `.agent` Format

The `.agent` format is the heart of the Murici ecosystem. It works as a zipped package that safely and portably bundles the brain, instructions, and files of an AI agent.

## Why does this matter?
When we interact with raw LLMs, we need to send enormous "System Prompts" every time. The `.agent` format solves this by creating guardrails: it organizes knowledge into modules (RAG) and defines Finite State Machines. This means the model only reads what is relevant to that exact moment in the conversation, making responses much more precise, focused, and less prone to hallucination.

Moreover, it is through this format that developers can design rich tours like the one you are taking right now, injecting dynamic CSS and interacting with Murici's native panels!

## How do I create my own?
To create your own AI package with extreme ease, Entelékheia built the official **Dot Agent CLI** (`@dot-agent/cli`).
You just need to install it, use the `init` command in your terminal, and it will scaffold the entire structure for you. Furthermore, the CLI allows you to plug in MCP servers to expand your creation even further.
