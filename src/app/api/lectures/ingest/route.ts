import { NextRequest, NextResponse } from "next/server"
import { runIngestAgent } from "@/lib/agents/ingest-agent"
import { createServiceClient } from "@/lib/supabase/server"

export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const { url, folderId } = await request.json()
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required." }, { status: 400 })
    }

    // Run IngestAgent — validates, fetches transcript, chunks
    const result = await runIngestAgent(url)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 })
    }

    // Persist lecture record to Supabase
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("lectures")
      .insert({
        youtube_url: url,
        video_id: result.videoId,
        title: result.title,
        thumbnail_url: result.thumbnailUrl,
        channel_name: result.channelName,
        duration_seconds: result.durationSeconds,
        processing_status: "processing",
        folder_id: folderId ?? null,
      })
      .select("id")
      .single()

    if (error || !data) {
      console.error("Supabase insert error:", error)
      return NextResponse.json({ error: "Failed to save lecture. Try again." }, { status: 500 })
    }

    // Store chunks for content + embed agents to use
    await supabase.from("lecture_chunks").insert({
      lecture_id: data.id,
      chunks: result.chunks,
    })

    return NextResponse.json({ lectureId: data.id })
  } catch (err) {
    console.error("Ingest route error:", err)
    return NextResponse.json({ error: "Unexpected error. Try again." }, { status: 500 })
  }
}
