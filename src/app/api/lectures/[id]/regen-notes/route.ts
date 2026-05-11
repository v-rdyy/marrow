import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { generateLectureNotes } from "@/lib/agents/content-agent"
import type { Chunk } from "@/types"

export const maxDuration = 60

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: chunkData } = await supabase
    .from("lecture_chunks")
    .select("chunks")
    .eq("lecture_id", id)
    .single()

  if (!chunkData?.chunks) {
    return NextResponse.json({ error: "Transcript not found." }, { status: 404 })
  }

  const chunks: Chunk[] = chunkData.chunks
  const notes = await generateLectureNotes(chunks)

  await supabase.from("lecture_content").upsert({
    lecture_id: id,
    lecture_notes: notes.notes,
    chunk_descriptions: notes.chunkDescriptions,
  }, { onConflict: "lecture_id" })

  return NextResponse.json({ ok: true })
}
