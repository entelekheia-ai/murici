/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

export { createPrompt, updatePrompt, deletePrompt } from "@/lib/local-db/stubs"
export async function getPromptsByWorkspaceId(workspaceId: string): Promise<any[]> { return [] }
export async function getPromptWorkspacesByWorkspaceId(workspaceId: string): Promise<{ prompts: any[] }> { return { prompts: [] } }
export async function createPromptWorkspaces(data: any[]): Promise<any[]> { return [] }
export async function deletePromptWorkspace(id: string): Promise<void> {}
export async function getPromptWorkspacesByPromptId(id: string): Promise<{ workspaces: any[] }> { return { workspaces: [] } }
