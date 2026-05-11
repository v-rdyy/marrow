import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import type { Lecture } from "@/types"

function mapLecture(row: Record<string, unknown>): Lecture {
  return {
    id: row.id as string,
    folderId: row.folder_id as string | null,
    title: row.title as string,
    youtubeUrl: row.youtube_url as string,
    videoId: row.video_id as string,
    thumbnailUrl: row.thumbnail_url as string,
    durationSeconds: row.duration_seconds as number,
    channelName: row.channel_name as string,
    processingStatus: row.processing_status as Lecture["processingStatus"],
    errorMessage: row.error_message as string | undefined,
    sortOrder: (row.sort_order as number) ?? 0,
    createdAt: row.created_at as string,
    color: row.color as string | undefined,
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const folderId = searchParams.get("folderId")

  const supabase = createServiceClient()
  let query = supabase.from("lectures").select("*").order("sort_order").order("created_at", { ascending: false })

  if (folderId === "null") {
    query = query.is("folder_id", null)
  } else if (folderId) {
    query = query.eq("folder_id", folderId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ lectures: [] })

  return NextResponse.json({ lectures: (data ?? []).map(mapLecture) })
}
