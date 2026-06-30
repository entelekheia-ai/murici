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

// Local type definitions replacing Supabase generated types.
// Matches the shape of the original Supabase tables used across the codebase.

export interface Chat {
  id: string
  user_id: string
  workspace_id: string
  assistant_id: string | null
  title: string
  name: string // alias kept for compatibility
  model: string
  prompt: string
  temperature: number
  context_length: number
  include_profile_context: boolean
  include_workspace_instructions: boolean
  embeddings_provider: string
  created_at: string
  updated_at: string | null
  sharing: string
  folder_id: string | null
  last_shared_message_id: string | null
  image_paths: string[]
}

export interface Message {
  id: string
  chat_id: string
  user_id: string
  assistant_id: string | null
  role: "user" | "assistant" | "system" | "tool"
  content: string
  model: string
  sequence_number: number
  tool_calls?: any[]
  tool_call_id?: string
  image_paths: string[]
  created_at: string
  updated_at: string | null
}

export interface Folder {
  id: string
  user_id: string
  workspace_id: string
  name: string
  description: string
  type: string
  created_at: string
  updated_at: string | null
}

export interface Workspace {
  id: string
  user_id: string
  name: string
  description: string
  instructions: string
  default_model: string
  default_prompt: string
  default_temperature: number
  default_context_length: number
  default_chat_settings: any
  embeddings_provider: string
  include_profile_context: boolean
  include_workspace_instructions: boolean
  is_home: boolean
  created_at: string
  updated_at: string | null
  sharing: string
  image_path: string
}

export interface Profile {
  id: string
  user_id: string
  username: string
  display_name: string
  bio: string
  profile_context: string
  image_url: string
  image_path: string
  openai_api_key: string | null
  anthropic_api_key: string | null
  google_gemini_api_key: string | null
  mistral_api_key: string | null
  groq_api_key: string | null
  perplexity_api_key: string | null
  azure_openai_api_key: string | null
  openrouter_api_key: string | null
  openai_organization_id: string | null
  azure_openai_endpoint: string | null
  azure_openai_35_turbo_id: string | null
  azure_openai_45_vision_id: string | null
  azure_openai_45_turbo_id: string | null
  azure_openai_embeddings_id: string | null
  use_azure_openai: boolean
  has_onboarded: boolean
  background_model_id: string | null
  created_at: string
  updated_at: string | null
}

export interface Model {
  id: string
  user_id: string
  workspace_id: string | null
  name: string
  description: string
  api_key: string
  base_url: string
  model_id: string
  context_length: number
  created_at: string
  updated_at: string | null
  sharing: string
  folder_id: string | null
}

export interface Prompt {
  id: string
  user_id: string
  workspace_id: string | null
  name: string
  content: string
  created_at: string
  updated_at: string | null
  sharing: string
  folder_id: string | null
}

export interface FileItem {
  id: string
  file_id: string
  user_id: string
  content: string
  tokens: number
  openai_embedding: number[] | null
  local_embedding: number[] | null
  created_at: string
  updated_at: string | null
  sharing: string
}

// Minimal stubs for types that are kept for compatibility but out of scope for this fork
export interface Assistant {
  id: string
  user_id: string
  workspace_id: string | null
  name: string
  description: string
  prompt: string
  model: string
  temperature: number
  context_length: number
  include_profile_context: boolean
  include_workspace_instructions: boolean
  image_path: string
  created_at: string
  updated_at: string | null
  sharing: string
  folder_id: string | null
  embeddings_provider: string
}

export interface Collection {
  id: string
  user_id: string
  workspace_id: string | null
  name: string
  description: string
  created_at: string
  updated_at: string | null
  sharing: string
  folder_id: string | null
}

export interface File {
  id: string
  user_id: string
  name: string
  description: string
  file_path: string
  size: number
  tokens: number
  type: string
  created_at: string
  updated_at: string | null
  sharing: string
  folder_id: string | null
}

export interface Preset {
  id: string
  user_id: string
  workspace_id: string | null
  name: string
  description: string
  prompt: string
  model: string
  temperature: number
  context_length: number
  include_profile_context: boolean
  include_workspace_instructions: boolean
  embeddings_provider: string
  created_at: string
  updated_at: string | null
  sharing: string
  folder_id: string | null
}

export interface Tool {
  id: string
  user_id: string
  workspace_id: string | null
  name: string
  description: string
  url: string
  schema: string
  custom_headers: string | null
  created_at: string
  updated_at: string | null
  sharing: string
  folder_id: string | null
}

// Mirrors Supabase's Tables<> and TablesInsert<> helpers
export type Tables<T extends string> = T extends "chats"
  ? Chat
  : T extends "messages"
    ? Message
    : T extends "folders"
      ? Folder
      : T extends "workspaces"
        ? Workspace
        : T extends "profiles"
          ? Profile
          : T extends "models"
            ? Model
            : T extends "prompts"
              ? Prompt
              : T extends "file_items"
                ? FileItem
                : T extends "assistants"
                  ? Assistant
                  : T extends "collections"
                    ? Collection
                    : T extends "files"
                      ? File
                      : T extends "presets"
                        ? Preset
                        : T extends "tools"
                          ? Tool
                          : never

// TablesInsert/TablesUpdate: same shape as Tables but with all fields optional
export type TablesInsert<T extends string> = Partial<Tables<T>>
export type TablesUpdate<T extends string> = Partial<Tables<T>>
