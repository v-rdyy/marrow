import Anthropic from "@anthropic-ai/sdk"
import type { Chunk, OutlineNode, SummaryParagraph, Flashcard } from "@/types"

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

const SYSTEM_PROMPT = `You are a study guide author who creates materials from lecture transcripts.
CRITICAL RULES:
- Every claim must cite the chunk ID it came from using sourceChunkIds
- Never invent content not present in the transcript
- Use plain, student-friendly language
- Output valid JSON only — no prose wrapper, no markdown fences`

// ContentAgent: pure generation from structured chunks.
// Has no knowledge of YouTube, HTTP, or embeddings.
// Every output item carries explicit source chunk references for claim attribution.

export async function generateOutline(chunks: Chunk[]): Promise<OutlineNode[]> {
  const chunksJson = chunks.map((c) => `[${c.id} | ${formatTime(c.start)}] ${c.text}`).join("\n")

  const response = await getAnthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Create a hierarchical outline from this lecture transcript.
Each node must include: title (short phrase), chunkId (the chunk where this topic begins), timestamp (start seconds of that chunk), and children array.
Return JSON array of OutlineNode objects.

Transcript chunks:
${chunksJson}

Return format:
[{"title":"...","chunkId":"chunk_000","timestamp":0,"children":[...]}]`,
      },
    ],
  })

  const text = response.content[0].type === "text" ? response.content[0].text : ""
  return parseJSON(text, [])
}

export async function generateSummary(
  chunks: Chunk[],
  depth: "90s" | "5min" | "full"
): Promise<SummaryParagraph[]> {
  const depthLabel = depth === "90s" ? "90-second (~200 words)" : depth === "5min" ? "5-minute (~700 words)" : "comprehensive (~3000 words)"
  const structureGuide = depth === "90s"
    ? "Write 2-3 short sections. Each section: a bold key concept name, then 1-2 sentences explaining it. No headers needed."
    : depth === "5min"
    ? "Use ## section headers for each major topic. Under each: bullet points for key ideas, numbered steps for processes. Bold key terms on first use."
    : "Use ## headers for major topics and ### for sub-topics. Include: bullet points for definitions, numbered lists for steps/proofs, **Key insight:** callouts for important takeaways, and *Example:* lines for worked examples."

  const chunksJson = chunks.map((c) => `[${c.id}] ${c.text}`).join("\n")

  const tokenLimit = depth === "90s" ? 2000 : depth === "5min" ? 4000 : 8000
  const response = await getAnthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: tokenLimit,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Write a ${depthLabel} explanation of this lecture as if you are a great teacher helping a student truly understand the material — not just summarize it.

Structure rules:
- ${structureGuide}
- Use LaTeX for ALL math: inline math with $...$ and display/block equations with $$...$$
- Never write math as plain text (e.g. write $x^2 + y^2$ not "x squared plus y squared")
- Explain the intuition behind concepts, not just definitions
- Each section must include sourceChunkIds listing the chunk IDs it draws from

Return a JSON array where each element is one section/paragraph:
[{"text": "<markdown with LaTeX>", "sourceChunkIds": ["chunk_001", "chunk_002"]}]

Transcript chunks:
${chunksJson}`,
      },
    ],
  })

  const text = response.content[0].type === "text" ? response.content[0].text : ""
  return parseJSON(text, [])
}

export async function generateFlashcards(chunks: Chunk[]): Promise<Flashcard[]> {
  const chunksJson = chunks.map((c) => `[${c.id} | ${c.start}s] ${c.text}`).join("\n")

  const response = await getAnthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Create 15 high-quality study flashcards from this lecture transcript.
Test genuine understanding, not just recall. Each card must include: id (fc_001 etc.), question, answer (1-3 sentences), sourceChunkId (the chunk containing the answer), timestamp (start seconds of that chunk).
Return JSON array.

Transcript chunks:
${chunksJson}

Return format:
[{"id":"fc_001","question":"...","answer":"...","sourceChunkId":"chunk_005","timestamp":120}]`,
      },
    ],
  })

  const text = response.content[0].type === "text" ? response.content[0].text : ""
  return parseJSON(text, [])
}

export async function generateLectureNotes(chunks: Chunk[]): Promise<{
  notes: string
  chunkDescriptions: Record<string, string>
}> {
  const chunksJson = chunks.map((c) => `[${c.id} | ${formatTime(c.start)}] ${c.text}`).join("\n")

  const response = await getAnthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Generate comprehensive lecture notes from this transcript.

The "notes" field must be a thorough markdown document: use ## [MM:SS] headings for each topic, and under each heading explain every concept, definition, proof, example, and transition in full detail. These notes are what an AI tutor will read to answer student questions — so include everything, including worked examples, the reasoning behind each step, and how ideas connect.

The "chunkDescriptions" field maps each chunk_id to a ≤75 character description of what happens at that moment (used as a search result preview — describe the action/concept, not the literal words).

Return JSON only:
{
  "notes": "## [0:00] ...\n\n## [2:30] ...\n\n...",
  "chunkDescriptions": { "chunk_000": "...", "chunk_001": "...", ... }
}

Transcript:
${chunksJson}`,
      },
    ],
  })

  const text = response.content[0].type === "text" ? response.content[0].text : ""
  return parseJSON(text, { notes: "", chunkDescriptions: {} })
}

// Run all content generation tasks in parallel
export async function runContentAgent(chunks: Chunk[]): Promise<{
  outline: OutlineNode[]
  summary90s: SummaryParagraph[]
  summary5min: SummaryParagraph[]
  summaryFull: SummaryParagraph[]
  flashcards: Flashcard[]
}> {
  const [outline, summary90s, summary5min, summaryFull, flashcards] = await Promise.all([
    generateOutline(chunks),
    generateSummary(chunks, "90s"),
    generateSummary(chunks, "5min"),
    generateSummary(chunks, "full"),
    generateFlashcards(chunks),
  ])

  return { outline, summary90s, summary5min, summaryFull, flashcards }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

function parseJSON<T>(text: string, fallback: T): T {
  try {
    // Strip markdown fences if present
    const cleaned = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim()
    return JSON.parse(cleaned)
  } catch {
    console.error("ContentAgent JSON parse failed:", text.slice(0, 200))
    return fallback
  }
}
