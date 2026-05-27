export async function createCollection(data: any): Promise<any> { return { id: "stub", ...data } }
export async function updateCollection(id: string, data: any): Promise<any> { return { id, ...data } }
export async function deleteCollection(id: string): Promise<void> {}
export async function getCollectionsByWorkspaceId(workspaceId: string): Promise<any[]> { return [] }
export async function createCollectionFiles(data: any[]): Promise<any[]> { return [] }
export async function getCollectionWorkspacesByWorkspaceId(workspaceId: string): Promise<{ collections: any[] }> { return { collections: [] } }
export async function createCollectionWorkspaces(data: any[]): Promise<any[]> { return [] }
export async function deleteCollectionWorkspace(id: string): Promise<void> {}
export async function getCollectionWorkspacesByCollectionId(id: string): Promise<{ workspaces: any[] }> { return { workspaces: [] } }
