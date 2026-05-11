"use client"

import { useEffect, useRef, useCallback } from "react"

declare global {
  interface Window {
    YT: { Player: new (...args: unknown[]) => YTPlayer; PlayerState: Record<string, number> }
    onYouTubeIframeAPIReady: () => void
  }
}

type YTPlayer = {
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  playVideo: () => void
  destroy: () => void
}

export function useYouTubePlayer(videoId: string, containerId: string) {
  const playerRef = useRef<YTPlayer | null>(null)
  const readyRef = useRef(false)

  useEffect(() => {
    function initPlayer() {
      new window.YT.Player(containerId, {
        videoId,
        playerVars: {
          modestbranding: 1,
          rel: 0,
          enablejsapi: 1,
        },
        events: {
          // Use event.target — the constructor result may not have methods yet
          onReady: (event: { target: YTPlayer }) => {
            playerRef.current = event.target
            readyRef.current = true
          },
        },
      })
    }

    if (window.YT && window.YT.Player) {
      initPlayer()
      return
    }

    // Load IFrame API script if not already loaded
    if (!document.getElementById("youtube-iframe-api")) {
      const script = document.createElement("script")
      script.id = "youtube-iframe-api"
      script.src = "https://www.youtube.com/iframe_api"
      document.head.appendChild(script)
    }

    window.onYouTubeIframeAPIReady = initPlayer

    return () => {
      playerRef.current?.destroy()
      playerRef.current = null
      readyRef.current = false
    }
  }, [videoId, containerId])

  const seekTo = useCallback((seconds: number) => {
    if (playerRef.current && readyRef.current) {
      playerRef.current.seekTo(seconds, true)
      playerRef.current.playVideo()
    }
  }, [])

  return { seekTo }
}
