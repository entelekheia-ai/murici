/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

export async function createPreset(data: any): Promise<any> { return { id: "stub", ...data } }
export async function updatePreset(id: string, data: any): Promise<any> { return { id, ...data } }
export async function deletePreset(id: string): Promise<void> {}
export async function getPresetsByWorkspaceId(workspaceId: string): Promise<any[]> { return [] }
export async function getPresetWorkspacesByWorkspaceId(workspaceId: string): Promise<{ presets: any[] }> { return { presets: [] } }
export async function createPresetWorkspaces(data: any[]): Promise<any[]> { return [] }
export async function deletePresetWorkspace(id: string): Promise<void> {}
export async function getPresetWorkspacesByPresetId(id: string): Promise<{ workspaces: any[] }> { return { workspaces: [] } }
