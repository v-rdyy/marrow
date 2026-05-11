import { createServiceClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { WorkspaceInterior } from "@/components/workspace/WorkspaceInterior"

interface BreadcrumbItem {
  id: string
  name: string
}

async function buildBreadcrumb(
  supabase: ReturnType<typeof createServiceClient>,
  folderId: string
): Promise<BreadcrumbItem[]> {
  const chain: BreadcrumbItem[] = []
  let currentId: string | null = folderId

  // Walk up to the root (max 10 levels to prevent infinite loops)
  for (let i = 0; i < 10 && currentId; i++) {
    type FolderRow = { id: string; name: string; parent_id: string | null }
    // eslint-disable-next-line no-await-in-loop
    const res: { data: FolderRow | null; error: unknown } = await supabase
      .from("folders")
      .select("id, name, parent_id")
      .eq("id", currentId)
      .single() as { data: FolderRow | null; error: unknown }
    if (!res.data) break
    chain.unshift({ id: res.data.id, name: res.data.name })
    currentId = res.data.parent_id
  }

  return chain
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function WorkspacePage({ params }: Props) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: folder, error } = await supabase
    .from("folders")
    .select("id, name")
    .eq("id", id)
    .single()

  if (error || !folder) notFound()

  const breadcrumb = await buildBreadcrumb(supabase, folder.id)

  return (
    <WorkspaceInterior
      workspaceId={folder.id}
      workspaceName={folder.name}
      breadcrumb={breadcrumb}
    />
  )
}
