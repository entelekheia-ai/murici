/*
 * Copyright (c) 2026 Danilo Borges (https://github.com/daniloborges)
 * Licensed under the Apache License, Version 2.0
 *
 * Portions Copyright (c) 2023 McKay Wrigley (Chatbot UI), licensed under the MIT License
 */

export { getAssistantFilesByAssistantId } from "@/lib/local-db/stubs"
export async function createAssistantFiles(data: any[]): Promise<any[]> { return [] }
export async function createAssistantFile(data: any): Promise<any> { return data }
export async function deleteAssistantFile(id: string): Promise<void> {}
