import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import type { Document } from "@/types"

function mapDoc(d: Record<string, unknown>): Document {
  return {
    id: d.id as string,
    folderId: d.folder_id as string | null,
    title: d.title as string,
    content: d.content as string,
    type: (d.type as "text" | "pdf") ?? "text",
    fileUrl: d.file_url as string | null,
    sortOrder: d.sort_order as number,
    createdAt: d.created_at as string,
    updatedAt: d.updated_at as string,
    color: d.color as string | undefined,
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const folderId = searchParams.get("folderId")

  const supabase = createServiceClient()
  let query = supabase
    .from("documents")
    .select("id, folder_id, title, content, type, file_url, sort_order, created_at, updated_at")
    .order("sort_order")
    .order("created_at")

  if (folderId === "null") {
    query = query.is("folder_id", null)
  } else if (folderId) {
    query = query.eq("folder_id", folderId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ documents: (data ?? []).map(mapDoc) })
}

export async function POST(req: Request) {
  const { title = "Untitled", content = "", folderId = null, type = "text", fileUrl = null } = await req.json()
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from("documents")
    .insert({ title, content, folder_id: folderId, type, file_url: fileUrl })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ document: mapDoc(data) })
}
