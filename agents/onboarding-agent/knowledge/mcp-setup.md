# Model Context Protocol (MCP)

To truly make your workspace powerful, your models need a way to safely interact with the environment around them. This is achieved via the Model Context Protocol (MCP)[cite: 3].

## Giving Hands to the AI
Without a protocol like MCP, an AI model lives in an isolated sandbox, limited only to what it was fed during training. MCP breaks the model out of that cage, giving it secure "hands" to interact with tools and interfaces:
* **Local and Remote Reach**: It allows trusted agents to securely read local project files, execute standalone code blocks, or interface with external developer and design tools like GitHub or Figma.

## How to configure it in Murici?
Murici has a visual, modern panel to manage your connections.
You can access the MCP Configuration panel to view active servers. You will need to provide the startup command (e.g., `npx`, `python`) and the path to the server package. Murici will automatically boot up and shut down the server in parallel with your chat!

*Note: For your own security, only connect MCP servers from sources you fully trust.*