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

import fs from "fs"
import path from "path"
import os from "os"
import { MCPConfig } from "@/types/mcp"

const CONFIG_DIR = path.join(os.homedir(), ".config", "murici")
const CONFIG_FILE = path.join(CONFIG_DIR, "mcp.json")

const DEFAULT_CONFIG: MCPConfig = {
  mcpServers: {}
}

/**
 * Ensures that the ~/.config/murici directory and mcp.json file exist.
 * If they do not exist, creates them with default values.
 */
function ensureConfigExists() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }

  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8")
  }
}

/**
 * Reads the MCP configuration from ~/.config/murici/mcp.json.
 */
export function getMCPConfig(): MCPConfig {
  ensureConfigExists()
  
  try {
    const data = fs.readFileSync(CONFIG_FILE, "utf8")
    return JSON.parse(data) as MCPConfig
  } catch (error) {
    console.error("Failed to read MCP config:", error)
    return DEFAULT_CONFIG
  }
}

/**
 * Writes the MCP configuration to ~/.config/murici/mcp.json.
 */
export function saveMCPConfig(config: MCPConfig): void {
  ensureConfigExists()
  
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8")
  } catch (error) {
    console.error("Failed to save MCP config:", error)
    throw new Error("Failed to save MCP configuration")
  }
}
