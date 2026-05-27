export { createPrompt, updatePrompt, deletePrompt } from "@/lib/local-db/stubs"
export async function getPromptsByWorkspaceId(workspaceId: string): Promise<any[]> { return [] }
export async function getPromptWorkspacesByWorkspaceId(workspaceId: string): Promise<{ prompts: any[] }> { return { prompts: [] } }
export async function createPromptWorkspaces(data: any[]): Promise<any[]> { return [] }
export async function deletePromptWorkspace(id: string): Promise<void> {}
export async function getPromptWorkspacesByPromptId(id: string): Promise<{ workspaces: any[] }> { return { workspaces: [] } }
