"use client"

import { useState } from "react"
import { Search, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ClaimSource } from "./ClaimSource"
import type { SearchResult } from "@/types"

interface Props {
  lectureId: string
}

export function SearchTab({ lectureId }: Props) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setSearched(true)

    try {
      const res = await fetch(`/api/lectures/${lectureId}/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setResults(data.results ?? [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <form onSubmit={handleSearch} className="flex gap-2 p-3 border-b shrink-0">
        <Input
          placeholder="Ask anything about this lecture..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" size="icon" disabled={loading || !query.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </form>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!searched && (
          <p className="text-sm text-muted-foreground">
            Search for any concept, term, or question — Marrow will find the exact moment in the lecture.
          </p>
        )}

        {searched && results.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">No relevant moments found. Try rephrasing your question.</p>
        )}

        {results.map((result, i) => (
          <div key={i} className="rounded-lg border bg-card p-3 space-y-2">
            <p className="text-sm font-medium leading-snug">
              {result.description ?? result.text.slice(0, 80) + "…"}
            </p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {Math.round(result.score * 100)}% match
              </span>
              <ClaimSource timestamp={result.start} label="Jump to moment →" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
