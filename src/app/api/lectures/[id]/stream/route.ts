import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { runContentAgent, generateLectureNotes } from "@/lib/agents/content-agent"
import { embedChunks } from "@/lib/agents/search-agent"
import type { Chunk, ProcessingEvent } from "@/types"

export const maxDuration = 60

function sseEvent(data: ProcessingEvent): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  function send(event: ProcessingEvent) {
    writer.write(encoder.encode(sseEvent(event)))
  }

  // Run pipeline in background — don't await, let SSE stream progress
  ;(async () => {
    try {
      // Short-circuit if already finished (e.g. client reconnected after navigating away)
      const { data: lecture } = await supabase
        .from("lectures")
        .select("processing_status")
        .eq("id", id)
        .single()

      if (lecture?.processing_status === "completed") {
        send({ type: "completed" })
        writer.close()
        return
      }
      if (lecture?.processing_status === "failed") {
        send({ type: "error", message: "Processing failed." })
        writer.close()
        return
      }

      // Fetch chunks stored by IngestAgent
      const { data: chunkData } = await supabase
        .from("lecture_chunks")
        .select("chunks")
        .eq("lecture_id", id)
        .single()

      if (!chunkData?.chunks) {
        send({ type: "error", message: "Transcript not found. Please start over." })
        writer.close()
        return
      }

      const chunks: Chunk[] = chunkData.chunks

      send({ type: "content_start" })

      // ContentAgent: parallel generation (outline, summaries, flashcards, notes)
      // Each subtask resolves independently — we send events as they finish
      const outlinePromise = runContentAgentSubtask("outline", chunks, send)
      const flashcardsPromise = runContentAgentSubtask("flashcards", chunks, send)
      const summary90sPromise = runContentAgentSubtask("summary_90s", chunks, send)
      const summary5minPromise = runContentAgentSubtask("summary_5min", chunks, send)
      const summaryFullPromise = runContentAgentSubtask("summary_full", chunks, send)
      const notesPromise = generateLectureNotes(chunks)

      // SearchAgent: embed chunks in parallel with content generation
      send({ type: "embed_start", chunkCount: chunks.length })
      const embedPromise = embedChunks(chunks).then(async (embeddings) => {
        await supabase.from("lecture_content").upsert({
          lecture_id: id,
          embeddings: embeddings,
        }, { onConflict: "lecture_id" })
        send({ type: "embed_done" })
        return embeddings
      })

      // Wait for main content tasks (notes run in background — don't block completed event)
      const [outline, flashcards, summary90s, summary5min, summaryFull] = await Promise.all([
        outlinePromise,
        flashcardsPromise,
        summary90sPromise,
        summary5minPromise,
        summaryFullPromise,
      ])

      await embedPromise

      // Persist main content
      await supabase.from("lecture_content").upsert({
        lecture_id: id,
        chunks,
        outline,
        summary_90s: summary90s,
        summary_5min: summary5min,
        summary_full: summaryFull,
        flashcards,
      }, { onConflict: "lecture_id" })

      // Mark lecture as completed and notify frontend immediately
      await supabase
        .from("lectures")
        .update({ processing_status: "completed" })
        .eq("id", id)

      send({ type: "completed" })

      // Notes persist in background after stream closes — doesn't block the user
      notesPromise.then(async (notes) => {
        await supabase.from("lecture_content").upsert({
          lecture_id: id,
          lecture_notes: notes.notes,
          chunk_descriptions: notes.chunkDescriptions,
        }, { onConflict: "lecture_id" })
      }).catch((err) => console.error("Background notes generation failed:", err))
    } catch (err) {
      console.error("Stream pipeline error:", err)
      const message = err instanceof Error ? err.message : "Processing failed."
      send({ type: "error", message })

      await supabase
        .from("lectures")
        .update({ processing_status: "failed", error_message: message })
        .eq("id", id)
    } finally {
      try { writer.close() } catch { /* already closed */ }
    }
  })()

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}

async function runContentAgentSubtask(
  task: "outline" | "flashcards" | "summary_90s" | "summary_5min" | "summary_full",
  chunks: Chunk[],
  send: (event: ProcessingEvent) => void
) {
  const { generateOutline, generateSummary, generateFlashcards } = await import("@/lib/agents/content-agent")

  if (task === "outline") {
    const outline = await generateOutline(chunks)
    send({ type: "outline_done", outline })
    return outline
  }
  if (task === "flashcards") {
    const flashcards = await generateFlashcards(chunks)
    send({ type: "flashcards_done", flashcards })
    return flashcards
  }
  const depthMap = { summary_90s: "90s", summary_5min: "5min", summary_full: "full" } as const
  const depth = depthMap[task as keyof typeof depthMap]
  const paragraphs = await generateSummary(chunks, depth)

  if (task === "summary_90s") send({ type: "summary_90s_done", paragraphs })
  if (task === "summary_5min") send({ type: "summary_5min_done", paragraphs })
  if (task === "summary_full") send({ type: "summary_full_done", paragraphs })

  return paragraphs
}
