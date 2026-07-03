# Model Context Protocol (MCP)

The MCP (Model Context Protocol) is the industry standard that allows your Artificial Intelligence model to converse with real-world tools, databases, web panels, and APIs outside the chat box.

## Why is it essential?
Without MCP, the AI is trapped in a sandbox containing only its original training data. By plugging MCP servers into Murici, the LLM gains "hands" to:
- Read your local files securely.
- Access Figma, Slack, GitHub, or your Postgres database.
- Execute isolated code snippets in your terminal.

## How to configure it in Murici?
Murici has a visual, modern panel to manage your connections.
You can access the MCP Configuration panel to view active servers. You will need to provide the startup command (e.g., `npx`, `python`) and the path to the server package. Murici will automatically boot up and shut down the server in parallel with your chat!

Only connect MCP servers you trust — they can read your files or access external accounts on your behalf.
