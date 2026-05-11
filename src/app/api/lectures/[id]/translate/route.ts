import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { createServiceClient } from "@/lib/supabase/server"
import { SUPPORTED_LANGUAGES } from "@/types"
import type { OutlineNode, SummaryParagraph, Flashcard } from "@/types"

export const maxDuration = 60

// Strip markdown fences from model output
function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  return m ? m[1].trim() : s.trim()
}

// Translate a chunk of content via Claude, returning parsed JSON or null
async function translateChunk(
  anthropic: Anthropic,
  langLabel: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8096,
    messages: [
      {
        role: "user",
        content: `Translate lecture study materials from English to ${langLabel}.

RULES:
- Translate ONLY: "title" in outline nodes, "text" in summary paragraphs, "question"/"answer" in flashcards.
- Preserve ALL other fields exactly: chunkId, timestamp, sourceChunkIds, id, sourceChunkId, children.
- Return ONLY raw JSON — no markdown fences, no explanation.

${JSON.stringify(data)}`,
      },
    ],
  })

  const raw = msg.content[0]?.type === "text" ? msg.content[0].text : ""
  try {
    return JSON.parse(stripFences(raw))
  } catch {
    return null
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { lang } = await request.json()

  const langEntry = SUPPORTED_LANGUAGES.find((l) => l.code === lang && l.code !== "other")
  if (!lang || !langEntry) {
    return NextResponse.json({ error: "Invalid language code" }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Return cached translation if it exists
  const { data: cached } = await supabase
    .from("lecture_translations")
    .select("outline, summary_90s, summary_5min, summary_full, flashcards")
    .eq("lecture_id", id)
    .eq("lang", lang)
    .single()

  if (cached?.outline && cached?.flashcards) {
    return NextResponse.json({
      translation: {
        lectureId: id,
        lang,
        outline: cached.outline,
        summary90s: cached.summary_90s,
        summary5min: cached.summary_5min,
        summaryFull: cached.summary_full,
        flashcards: cached.flashcards,
      },
    })
  }

  // Load source content
  const { data: contentRow, error: contentErr } = await supabase
    .from("lecture_content")
    .select("outline, summary_90s, summary_5min, summary_full, flashcards")
    .eq("lecture_id", id)
    .single()

  if (contentErr || !contentRow) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 })
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const langLabel = langEntry.label

  const outline: OutlineNode[] = contentRow.outline ?? []
  const summary90s: SummaryParagraph[] = contentRow.summary_90s ?? []
  const summary5min: SummaryParagraph[] = contentRow.summary_5min ?? []
  const summaryFull: SummaryParagraph[] = contentRow.summary_full ?? []
  const flashcards: Flashcard[] = contentRow.flashcards ?? []

  // Split into two calls: (1) outline + flashcards + short summaries, (2) full summary
  // This keeps each call well within the 8k output token limit
  const [part1, part2] = await Promise.all([
    translateChunk(anthropic, langLabel, { outline, summary90s, summary5min, flashcards }),
    translateChunk(anthropic, langLabel, { summaryFull }),
  ])

  const translatedOutline = (Array.isArray(part1?.outline) ? part1.outline : outline) as OutlineNode[]
  const translatedSummary90s = (Array.isArray(part1?.summary90s) ? part1.summary90s : summary90s) as SummaryParagraph[]
  const translatedSummary5min = (Array.isArray(part1?.summary5min) ? part1.summary5min : summary5min) as SummaryParagraph[]
  const translatedFlashcards = (Array.isArray(part1?.flashcards) ? part1.flashcards : flashcards) as Flashcard[]
  const translatedSummaryFull = (Array.isArray(part2?.summaryFull) ? part2.summaryFull : summaryFull) as SummaryParagraph[]

  // Persist to cache
  await supabase.from("lecture_translations").upsert(
    {
      lecture_id: id,
      lang,
      outline: translatedOutline,
      summary_90s: translatedSummary90s,
      summary_5min: translatedSummary5min,
      summary_full: translatedSummaryFull,
      flashcards: translatedFlashcards,
    },
    { onConflict: "lecture_id,lang" }
  )

  return NextResponse.json({
    translation: {
      lectureId: id,
      lang,
      outline: translatedOutline,
      summary90s: translatedSummary90s,
      summary5min: translatedSummary5min,
      summaryFull: translatedSummaryFull,
      flashcards: translatedFlashcards,
    },
  })
}
