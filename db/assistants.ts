/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

export async function createAssistant(data: any): Promise<any> { return { id: "stub", ...data } }
export async function updateAssistant(id: string, data: any): Promise<any> { return { id, ...data } }
export async function deleteAssistant(id: string): Promise<void> {}
export async function getAssistantsByWorkspaceId(workspaceId: string): Promise<any[]> { return [] }
export async function getAssistantWorkspacesByWorkspaceId(workspaceId: string): Promise<{ assistants: any[] }> { return { assistants: [] } }
export async function createAssistantWorkspaces(data: any[]): Promise<any[]> { return [] }
export async function deleteAssistantWorkspace(id: string): Promise<void> {}
export async function getAssistantWorkspacesByAssistantId(id: string): Promise<{ workspaces: any[] }> { return { workspaces: [] } }
