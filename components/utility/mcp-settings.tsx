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

import { FC, useEffect, useState } from "react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { MCPConfig } from "@/types/mcp"

export const MCPSettings: FC = () => {
  const [config, setConfig] = useState<MCPConfig | null>(null)
  const [addingType, setAddingType] = useState<"stdio" | "sse" | null>(null)

  const [newName, setNewName] = useState("")
  const [newCommand, setNewCommand] = useState("")
  const [newArgs, setNewArgs] = useState("")
  const [newUrl, setNewUrl] = useState("")

  useEffect(() => {
    fetch("/api/mcp/config")
      .then(res => res.json())
      .then(setConfig)
  }, [])

  const saveConfig = async (newConfig: MCPConfig) => {
    setConfig(newConfig)
    await fetch("/api/mcp/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newConfig)
    })
  }

  const handleSaveAdd = () => {
    if (!newName) return

    if (addingType === "stdio") {
      if (!newCommand) return
      saveConfig({
        ...config,
        mcpServers: {
          ...config?.mcpServers,
          [newName]: {
            transport: "stdio",
            command: newCommand,
            args: newArgs ? newArgs.split(",").map(s => s.trim()) : []
          }
        }
      })
    } else if (addingType === "sse") {
      if (!newUrl) return
      saveConfig({
        ...config,
        mcpServers: {
          ...config?.mcpServers,
          [newName]: {
            transport: "sse",
            url: newUrl
          }
        }
      })
    }

    setAddingType(null)
    setNewName("")
    setNewCommand("")
    setNewArgs("")
    setNewUrl("")
  }

  const handleRemove = (name: string) => {
    if (!config) return
    const newServers = { ...config.mcpServers }
    delete newServers[name]
    saveConfig({ ...config, mcpServers: newServers })
  }

  if (!config) return <div className="p-4">Loading MCP Config...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Installed MCP Servers</Label>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddingType("stdio")}
          >
            + Stdio Server
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddingType("sse")}
          >
            + SSE Server
          </Button>
        </div>
      </div>

      {addingType && (
        <div className="space-y-3 rounded-md border bg-muted/50 p-3">
          <div className="text-sm font-bold">
            Add {addingType === "stdio" ? "Stdio" : "SSE"} Server
          </div>
          <div className="space-y-2">
            <Input
              placeholder="Server name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
            {addingType === "stdio" ? (
              <>
                <Input
                  placeholder="Command (e.g. npx)"
                  value={newCommand}
                  onChange={e => setNewCommand(e.target.value)}
                />
                <Input
                  placeholder="Args (comma separated)"
                  value={newArgs}
                  onChange={e => setNewArgs(e.target.value)}
                />
              </>
            ) : (
              <Input
                placeholder="URL"
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
              />
            )}
            <div className="flex space-x-2 pt-2">
              <Button size="sm" onClick={handleSaveAdd}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAddingType(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {Object.keys(config.mcpServers || {}).length === 0 && !addingType ? (
        <div className="text-sm opacity-50">No MCP servers configured.</div>
      ) : (
        <div className="mt-4 space-y-2">
          {Object.entries(config.mcpServers || {}).map(([name, server]) => (
            <div
              key={name}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div>
                <div className="text-sm font-bold">{name}</div>
                <div className="mt-1 text-xs opacity-70">
                  {server.transport === "stdio"
                    ? `[Stdio] ${server.command} ${server.args?.join(" ")}`
                    : `[SSE] ${server.url}`}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemove(name)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
