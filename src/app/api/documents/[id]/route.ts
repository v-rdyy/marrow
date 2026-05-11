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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ document: mapDoc(data) })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const supabase = createServiceClient()

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.title !== undefined) update.title = body.title
  if (body.content !== undefined) update.content = body.content
  if (body.folderId !== undefined) update.folder_id = body.folderId
  if (body.color !== undefined) update.color = body.color

  const { data, error } = await supabase
    .from("documents")
    .update(update)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ document: mapDoc(data) })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const { error } = await supabase.from("documents").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
