"use client"

import { useEffect } from "react"
import { useYouTubePlayer } from "@/hooks/useYouTubePlayer"
import { useUIStore } from "@/stores/ui-store"

const PLAYER_ID = "marrow-yt-player"

interface Props {
  videoId: string
}

export function VideoPlayer({ videoId }: Props) {
  const { seekTarget, clearSeekTarget } = useUIStore()
  const { seekTo } = useYouTubePlayer(videoId, PLAYER_ID)

  // Watch seekTarget from global store — any component can trigger a seek
  useEffect(() => {
    if (seekTarget !== null) {
      seekTo(seekTarget)
      clearSeekTarget()
    }
  }, [seekTarget, seekTo, clearSeekTarget])

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
      <div id={PLAYER_ID} className="w-full h-full" />
    </div>
  )
}
