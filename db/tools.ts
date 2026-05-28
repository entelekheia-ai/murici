/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

export async function createTool(data: any): Promise<any> { return { id: "stub", ...data } }
export async function updateTool(id: string, data: any): Promise<any> { return { id, ...data } }
export async function deleteTool(id: string): Promise<void> {}
export async function getToolsByWorkspaceId(workspaceId: string): Promise<any[]> { return [] }
export async function getToolWorkspacesByWorkspaceId(workspaceId: string): Promise<{ tools: any[] }> { return { tools: [] } }
export async function createToolWorkspaces(data: any[]): Promise<any[]> { return [] }
export async function deleteToolWorkspace(id: string): Promise<void> {}
export async function getToolWorkspacesByToolId(id: string): Promise<{ workspaces: any[] }> { return { workspaces: [] } }
