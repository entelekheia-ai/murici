export async function createFile(data: any, file: any, workspaceId: string, provider: string): Promise<any> { return { id: "stub", ...data } }
export async function createFileBasedOnExtension(name: string, file: any, workspaceId: string, provider: string): Promise<any> { return { id: "stub", name } }
export async function createDocXFile(data: any, file: any, workspaceId: string, provider: string): Promise<any> { return { id: "stub", ...data } }
export async function updateFile(id: string, data: any): Promise<any> { return { id, ...data } }
export async function deleteFile(id: string): Promise<void> {}
export async function getFilesByWorkspaceId(workspaceId: string): Promise<any[]> { return [] }
export async function getFileWorkspacesByWorkspaceId(workspaceId: string): Promise<{ files: any[] }> { return { files: [] } }
export async function createFileWorkspaces(data: any[]): Promise<any[]> { return [] }
export async function deleteFileWorkspace(id: string): Promise<void> {}
export async function getFileWorkspacesByFileId(id: string): Promise<{ workspaces: any[] }> { return { workspaces: [] } }
