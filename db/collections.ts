/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

export async function createCollection(data: any): Promise<any> { return { id: "stub", ...data } }
export async function updateCollection(id: string, data: any): Promise<any> { return { id, ...data } }
export async function deleteCollection(id: string): Promise<void> {}
export async function getCollectionsByWorkspaceId(workspaceId: string): Promise<any[]> { return [] }
export async function createCollectionFiles(data: any[]): Promise<any[]> { return [] }
export async function getCollectionWorkspacesByWorkspaceId(workspaceId: string): Promise<{ collections: any[] }> { return { collections: [] } }
export async function createCollectionWorkspaces(data: any[]): Promise<any[]> { return [] }
export async function deleteCollectionWorkspace(id: string): Promise<void> {}
export async function getCollectionWorkspacesByCollectionId(id: string): Promise<{ workspaces: any[] }> { return { workspaces: [] } }
