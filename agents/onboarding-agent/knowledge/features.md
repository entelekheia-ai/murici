# Features and Internal Tools

Murici is not just a chat interface. It was designed to be your integrated "second brain", packed with advanced tools to structure your knowledge.

## 1. Local-First Storage (IndexedDB)
Your history, settings, and conversation transcripts are stored locally in your browser via IndexedDB — no account or sync needed to get started. And because Murici also supports fully local models (Ollama, LM Studio), you have the option to run your entire workflow, including background tasks like Enrich, without any data leaving your machine.

## 2. The Knowledge Graph
You will soon realize that we do not rely purely on text-based search. Murici features a native **Knowledge Graph**. This allows agents to analyze the deep relationships between the topics you discuss, entities, and contexts, bringing structured answers over time.

## 3. The "Enrich" Feature
Throughout your conversations, whenever you feel the AI (or yourself) generated a vital piece of reasoning, snippet, or documentation, you can send it to "Enrich" your base. This process goes through an Extraction funnel (using the background automated model) and ends up cleanly structured in the Graph to be utilized later.
