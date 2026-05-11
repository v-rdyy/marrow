import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from("lecture_content")
    .select("lecture_id, chunks, outline, summary_90s, summary_5min, summary_full, flashcards, lecture_notes, chunk_descriptions")
    .eq("lecture_id", id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: "Content not ready yet." }, { status: 404 })
  }

  return NextResponse.json({
    lectureId: data.lecture_id,
    chunks: data.chunks ?? [],
    outline: data.outline ?? [],
    summary90s: data.summary_90s ?? [],
    summary5min: data.summary_5min ?? [],
    summaryFull: data.summary_full ?? [],
    flashcards: data.flashcards ?? [],
    lectureNotes: data.lecture_notes ?? null,
    chunkDescriptions: data.chunk_descriptions ?? {},
  })
}
