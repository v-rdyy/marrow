import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { searchChunks } from "@/lib/agents/search-agent"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const query = request.nextUrl.searchParams.get("q")

  if (!query?.trim()) {
    return NextResponse.json({ error: "Query is required." }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("lecture_content")
    .select("embeddings, chunk_descriptions")
    .eq("lecture_id", id)
    .single()

  if (error || !data?.embeddings) {
    return NextResponse.json({ error: "Search index not ready yet." }, { status: 404 })
  }

  const descriptions: Record<string, string> = data.chunk_descriptions ?? {}
  const rawResults = await searchChunks(query, data.embeddings)
  const results = rawResults.map((r) => ({
    ...r,
    description: descriptions[r.chunkId] ?? null,
  }))
  return NextResponse.json({ results })
}
