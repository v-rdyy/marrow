import { fetchTranscript, fetchVideoMetadata, extractVideoId } from "@/lib/youtube/extract"
import { extractVisualContent, mergeVisualIntoChunks } from "@/lib/youtube/visual"
import type { Chunk } from "@/types"

export type IngestResult =
  | {
      ok: true
      videoId: string
      title: string
      thumbnailUrl: string
      channelName: string
      durationSeconds: number
      chunks: Chunk[]
    }
  | { ok: false; error: string }

// IngestAgent: responsible for fetching, validating, and chunking lecture transcripts.
// Makes judgment calls about transcript quality — rejects inputs that would poison downstream agents.
// Has no content generation knowledge; only deals with source material acquisition.
export async function runIngestAgent(youtubeUrl: string): Promise<IngestResult> {
  const videoId = extractVideoId(youtubeUrl)
  if (!videoId) {
    return { ok: false, error: "Invalid YouTube URL. Paste a direct link to a YouTube video." }
  }

  const [transcriptResult, metadata] = await Promise.all([
    fetchTranscript(videoId),
    fetchVideoMetadata(videoId),
  ])

  if (!transcriptResult.ok) {
    return { ok: false, error: transcriptResult.message }
  }

  let { chunks } = transcriptResult

  // Parallel visual extraction — enriches chunks with on-screen slide/whiteboard content.
  // Runs concurrently; any failure is silently skipped so ingest always completes.
  const visuals = await extractVisualContent(videoId)
  if (visuals.length > 0) {
    chunks = mergeVisualIntoChunks(chunks, visuals)
    console.log(`[ingest] merged ${visuals.length} visual segments into chunks`)
  }

  const durationSeconds = chunks[chunks.length - 1]?.end ?? 0

  return {
    ok: true,
    videoId,
    title: metadata?.title ?? "Untitled Lecture",
    thumbnailUrl: metadata?.thumbnailUrl ?? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    channelName: metadata?.channelName ?? "Unknown",
    durationSeconds,
    chunks,
  }
}
