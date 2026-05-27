export { getModelById, getModelWorkspacesByWorkspaceId } from "@/lib/local-db/stubs"
export async function createModel(data: any): Promise<any> { return { id: "stub", ...data, created_at: new Date().toISOString() } }
export async function updateModel(id: string, data: any): Promise<any> { return { id, ...data } }
export async function deleteModel(id: string): Promise<void> {}
export async function createModelWorkspaces(data: any[]): Promise<any[]> { return [] }
export async function deleteModelWorkspace(id: string): Promise<void> {}
export async function getModelWorkspacesByModelId(id: string): Promise<{ workspaces: any[] }> { return { workspaces: [] } }
