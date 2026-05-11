import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import type { Folder } from "@/types"

function mapFolder(f: Record<string, unknown>, lectureCounts: { folder_id: string }[], docCounts: { folder_id: string }[], subFolderCounts: { parent_id: string }[]): Folder {
  return {
    id: f.id as string,
    name: f.name as string,
    color: (f.color as Folder["color"]) ?? "default",
    sortOrder: (f.sort_order as number) ?? 0,
    createdAt: f.created_at as string,
    parentId: (f.parent_id as string | null) ?? null,
    lectureCount: lectureCounts.filter((l) => l.folder_id === f.id).length,
    documentCount: docCounts.filter((d) => d.folder_id === f.id).length,
    folderCount: subFolderCounts.filter((sf) => sf.parent_id === f.id).length,
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const parentId = searchParams.get("parentId")
  const all = searchParams.get("all") === "true"

  const supabase = createServiceClient()

  // ?all=true — return every folder flat (for move dialog tree)
  if (all) {
    const { data, error } = await supabase
      .from("folders")
      .select("id, name, color, sort_order, created_at, parent_id")
      .order("sort_order")
      .order("created_at")
    if (error) return NextResponse.json({ folders: [] })
    const minimal = (data ?? []).map((f) => ({ id: f.id as string, name: f.name as string, parentId: (f.parent_id as string | null) ?? null }))
    return NextResponse.json({ folders: minimal })
  }

  // Try to query with parent_id filter; fall back to all folders if column missing
  let folders: Record<string, unknown>[] = []

  if (parentId && parentId !== "null") {
    const { data, error } = await supabase
      .from("folders")
      .select("id, name, color, sort_order, created_at, parent_id")
      .eq("parent_id", parentId)
      .order("sort_order")
      .order("created_at")
    if (error && error.code === "PGRST204") {
      // parent_id column doesn't exist yet — return empty
      return NextResponse.json({ folders: [] })
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    folders = data ?? []
  } else {
    // Root level — get folders with no parent
    const { data, error } = await supabase
      .from("folders")
      .select("id, name, color, sort_order, created_at, parent_id")
      .is("parent_id", null)
      .order("sort_order")
      .order("created_at")

    if (error) {
      if (error.code === "PGRST204" || error.message?.includes("parent_id")) {
        // Column doesn't exist — fetch all folders as root workspaces
        const { data: allData, error: allError } = await supabase
          .from("folders")
          .select("id, name, color, sort_order, created_at")
          .order("sort_order")
          .order("created_at")
        if (allError) return NextResponse.json({ error: allError.message }, { status: 500 })
        folders = (allData ?? []).map((f) => ({ ...f, parent_id: null }))
      } else {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else {
      folders = data ?? []
    }
  }

  const [{ data: lectureCounts }, { data: docCounts }, { data: subFolderCounts }] = await Promise.all([
    supabase.from("lectures").select("folder_id"),
    supabase.from("documents").select("folder_id"),
    supabase.from("folders").select("parent_id").not("parent_id", "is", null),
  ])

  const mapped = folders.map((f) =>
    mapFolder(f, lectureCounts ?? [], docCounts ?? [], (subFolderCounts ?? []) as { parent_id: string }[])
  )

  return NextResponse.json({ folders: mapped })
}

export async function POST(req: Request) {
  const { name, color = "default", parentId = null } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 })

  const supabase = createServiceClient()

  // Try insert with parent_id first
  let data, error
  ;({ data, error } = await supabase
    .from("folders")
    .insert({ name: name.trim(), color, parent_id: parentId })
    .select()
    .single())

  if (error && (error.code === "PGRST204" || error.message?.includes("parent_id") || error.message?.includes("schema cache"))) {
    // parent_id column doesn't exist — insert without it
    ;({ data, error } = await supabase
      .from("folders")
      .insert({ name: name.trim(), color })
      .select()
      .single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const folder: Folder = {
    id: data.id,
    name: data.name,
    color: data.color,
    sortOrder: data.sort_order,
    createdAt: data.created_at,
    parentId: data.parent_id ?? null,
    lectureCount: 0,
    documentCount: 0,
    folderCount: 0,
  }

  return NextResponse.json({ folder })
}
