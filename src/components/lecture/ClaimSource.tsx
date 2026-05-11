"use client"

import { useUIStore } from "@/stores/ui-store"

interface Props {
  timestamp: number  // seconds
  label?: string
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

// The central UI primitive for claim attribution.
// Every AI-generated claim renders one of these. Clicking seeks the video.
export function ClaimSource({ timestamp, label }: Props) {
  const { seekTo } = useUIStore()

  return (
    <button
      onClick={() => seekTo(timestamp)}
      className="inline-flex items-center rounded px-1 py-0.5 text-xs font-mono bg-primary/10 text-primary hover:bg-primary/20 transition-colors ml-1 shrink-0"
      title={`Jump to ${formatTime(timestamp)}`}
    >
      {label ?? formatTime(timestamp)}
    </button>
  )
}
