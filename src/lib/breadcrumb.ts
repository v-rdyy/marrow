export type BreadcrumbItem = { id: string; name: string }

// Walk up the folder chain from a given folderId.
// Returns items ordered root → leaf (e.g. [Workspace, SubFolder]).
export async function buildFolderBreadcrumb(folderId: string | null): Promise<BreadcrumbItem[]> {
  const chain: BreadcrumbItem[] = []
  let currentId: string | null = folderId

  for (let i = 0; i < 10 && currentId; i++) {
    const res = await fetch(`/api/folders/${currentId}`)
    if (!res.ok) break
    const data = await res.json()
    if (!data.folder) break
    chain.unshift({ id: data.folder.id, name: data.folder.name })
    currentId = data.folder.parentId ?? null
  }

  return chain
}
