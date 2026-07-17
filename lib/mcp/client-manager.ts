/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import { getMCPConfig } from "./config-store"
import { MCPServerConfig } from "@/types/mcp"

class MCPClientManager {
  private clients: Map<string, Client> = new Map()
  private transports: Map<string, any> = new Map()

  /**
   * Connects to a specific server if not already connected.
   */
  async connectServer(
    name: string,
    serverConfig: MCPServerConfig
  ): Promise<Client> {
    if (this.clients.has(name)) {
      return this.clients.get(name)!
    }

    const client = new Client(
      {
        name: "murici-client",
        version: "1.0.0"
      },
      {
        capabilities: {}
      }
    )

    let transport: any

    if (serverConfig.transport === "stdio") {
      transport = new StdioClientTransport({
        command: serverConfig.command || "",
        args: serverConfig.args,
        env: {
          ...(serverConfig.env || {}),
          PATH: process.env.PATH || "" // ensure tools like npx are found
        }
      })
    } else if (serverConfig.transport === "sse") {
      transport = new SSEClientTransport(new URL(serverConfig.url || ""))
    } else {
      throw new Error(`Unsupported transport type: ${serverConfig.transport}`)
    }

    try {
      await client.connect(transport)
      this.clients.set(name, client)
      this.transports.set(name, transport)
      console.log(`[MCP] Connected to ${name}`)
      return client
    } catch (error) {
      console.error(`[MCP] Failed to connect to ${name}:`, error)
      throw error
    }
  }

  /**
   * Initializes all servers defined in the config.
   */
  async initializeAll(): Promise<void> {
    const config = getMCPConfig()
    const promises = Object.entries(config.mcpServers || {}).map(
      ([name, serverConfig]) =>
        this.connectServer(name, serverConfig).catch(() => null)
    )
    await Promise.all(promises)
  }

  /**
   * Returns all available tools from all connected servers.
   */
  async getAllTools(): Promise<{ serverName: string; tools: any[] }[]> {
    const results = []

    // Ensure all configured servers are connected
    const config = getMCPConfig()
    for (const [name, serverConfig] of Object.entries(
      config.mcpServers || {}
    )) {
      if (!this.clients.has(name)) {
        try {
          await this.connectServer(name, serverConfig)
        } catch (e) {
          continue
        }
      }
    }

    for (const [serverName, client] of this.clients.entries()) {
      try {
        const response = await client.listTools()
        results.push({
          serverName,
          tools: response.tools
        })
      } catch (error) {
        console.error(`[MCP] Failed to get tools from ${serverName}:`, error)
      }
    }
    return results
  }

  /**
   * Executes a tool on a specific server.
   */
  async executeTool(
    serverName: string,
    toolName: string,
    args: any
  ): Promise<any> {
    const client = this.clients.get(serverName)
    if (!client) {
      throw new Error(`Server not connected: ${serverName}`)
    }

    const response = await client.callTool({
      name: toolName,
      arguments: args
    })

    return response
  }

  /**
   * Disconnects a specific server.
   */
  async disconnect(serverName: string): Promise<void> {
    const client = this.clients.get(serverName)
    const transport = this.transports.get(serverName)

    if (client && transport) {
      // client.close() doesn't exist on all transport implementations perfectly yet,
      // but transport.close() usually does.
      try {
        await transport.close()
      } catch (e) {
        console.error(`[MCP] Error closing transport for ${serverName}:`, e)
      }
      this.clients.delete(serverName)
      this.transports.delete(serverName)
      console.log(`[MCP] Disconnected from ${serverName}`)
    }
  }
}

// Global singleton to persist across Next.js API route re-executions in development
const globalForMCP = globalThis as unknown as {
  mcpClientManager: MCPClientManager | undefined
}

export const mcpClientManager =
  globalForMCP.mcpClientManager ?? new MCPClientManager()

if (process.env.NODE_ENV !== "production") {
  globalForMCP.mcpClientManager = mcpClientManager
}
