import Anthropic from "@anthropic-ai/sdk"
import { searchChunks } from "./search-agent"
import type { Chunk } from "@/types"

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

type ChunkWithEmbedding = {
  chunkId: string
  start: number
  end: number
  text: string
  embedding: number[]
}

// TutorAgent: conversational AI grounded entirely in the lecture.
// The only agent that talks to users in real-time.
// Must call SearchAgent to retrieve relevant chunks before responding — never answers from memory alone.
// Returns response text and the source timestamps cited, for inline attribution in the UI.

export async function* runTutorAgent(
  query: string,
  storedEmbeddings: ChunkWithEmbedding[],
  chatHistory: { role: "user" | "assistant"; content: string }[],
  lectureTitle: string
): AsyncGenerator<{ text?: string; sourceTimestamps?: number[]; done?: boolean }> {
  // Step 1: SearchAgent retrieves relevant chunks (real agent composition)
  const relevantChunks = await searchChunks(query, storedEmbeddings, 5)

  const sourceTimestamps = relevantChunks.map((c) => c.start)

  // Step 2: Build grounded context from retrieved chunks
  const context = relevantChunks
    .map((c) => `[${formatTime(c.start)}] ${c.text}`)
    .join("\n\n")

  const systemPrompt = `You are a helpful AI tutor for the lecture: "${lectureTitle}".
You only answer questions based on the lecture transcript provided below.
When you reference something from the lecture, mention the timestamp like [8:42].
If the question isn't covered in the lecture, say so honestly.
Be conversational, clear, and helpful for a student studying this material.

Relevant lecture excerpts:
${context}`

  // Step 3: Stream response
  const messages = [
    ...chatHistory.slice(-6).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: query },
  ]

  // Yield source timestamps first so UI can display them immediately
  yield { sourceTimestamps }

  const stream = getAnthropic().messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  })

  for await (const chunk of stream) {
    if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
      yield { text: chunk.delta.text }
    }
  }

  yield { done: true }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}
