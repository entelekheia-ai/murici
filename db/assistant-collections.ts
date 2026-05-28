/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

export { getAssistantCollectionsByAssistantId } from "@/lib/local-db/stubs"
export async function createAssistantCollections(data: any[]): Promise<any[]> { return [] }
export async function createAssistantCollection(data: any): Promise<any> { return data }
export async function deleteAssistantCollection(id: string): Promise<void> {}
