import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("folders")
    .select("id, name, parent_id")
    .eq("id", id)
    .single()
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ folder: { id: data.id as string, name: data.name as string, parentId: (data.parent_id as string | null) ?? null } })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const supabase = createServiceClient()

  const update: Record<string, unknown> = {}
  if (body.name !== undefined) update.name = body.name
  if (body.color !== undefined) update.color = body.color
  if (body.sortOrder !== undefined) update.sort_order = body.sortOrder

  const { error } = await supabase.from("folders").update(update).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  // Unset folder_id on lectures and documents (cascade set null via schema)
  const { error } = await supabase.from("folders").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
