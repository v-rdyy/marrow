import OpenAI from "openai"
import type { Chunk, SearchResult } from "@/types"

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

// SearchAgent: stateful retrieval. Embeds transcript chunks and answers semantic queries.
// Has no opinion on content quality — it finds, it doesn't judge.
// Completely independent of ContentAgent; could be swapped for any vector store.

type ChunkWithEmbedding = {
  chunkId: string
  start: number
  end: number
  text: string
  embedding: number[]
}

export async function embedChunks(chunks: Chunk[]): Promise<ChunkWithEmbedding[]> {
  // Batch embed all chunks — text-embedding-3-small is cheap and fast
  const BATCH_SIZE = 100
  const results: ChunkWithEmbedding[] = []

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE)
    const response = await getOpenAI().embeddings.create({
      model: "text-embedding-3-small",
      input: batch.map((c) => c.text),
    })

    for (let j = 0; j < batch.length; j++) {
      results.push({
        chunkId: batch[j].id,
        start: batch[j].start,
        end: batch[j].end,
        text: batch[j].text,
        embedding: response.data[j].embedding,
      })
    }
  }

  return results
}

export async function searchChunks(
  query: string,
  storedEmbeddings: ChunkWithEmbedding[],
  topK = 5
): Promise<SearchResult[]> {
  const queryEmbeddingResponse = await getOpenAI().embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  })
  const queryEmbedding = queryEmbeddingResponse.data[0].embedding

  const scored = storedEmbeddings.map((chunk) => ({
    chunkId: chunk.chunkId,
    start: chunk.start,
    end: chunk.end,
    text: chunk.text,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }))

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((r) => r.score > 0.2)  // minimum relevance threshold
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}
