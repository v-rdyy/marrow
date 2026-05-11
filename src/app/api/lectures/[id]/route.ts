import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import type { Lecture } from "@/types"

function mapLecture(data: Record<string, unknown>): Lecture {
  return {
    id: data.id as string,
    folderId: data.folder_id as string | null,
    title: data.title as string,
    youtubeUrl: data.youtube_url as string,
    videoId: data.video_id as string,
    thumbnailUrl: data.thumbnail_url as string,
    durationSeconds: data.duration_seconds as number,
    channelName: data.channel_name as string,
    processingStatus: data.processing_status as Lecture["processingStatus"],
    errorMessage: data.error_message as string | undefined,
    sortOrder: (data.sort_order as number) ?? 0,
    createdAt: data.created_at as string,
    color: data.color as string | undefined,
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase.from("lectures").select("*").eq("id", id).single()
  if (error || !data) return NextResponse.json({ error: "Lecture not found." }, { status: 404 })

  return NextResponse.json(mapLecture(data))
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const supabase = createServiceClient()

  const update: Record<string, unknown> = {}
  if (body.title !== undefined) update.title = body.title
  if (body.folderId !== undefined) update.folder_id = body.folderId
  if (body.sortOrder !== undefined) update.sort_order = body.sortOrder
  if (body.color !== undefined) update.color = body.color

  const { error } = await supabase.from("lectures").update(update).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()
  const { error } = await supabase.from("lectures").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
