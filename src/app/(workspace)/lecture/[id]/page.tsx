"use client"

import { use } from "react"
import { useEffect, useState } from "react"
import { ProcessingView } from "@/components/processing/ProcessingView"
import { LectureView } from "@/components/lecture/LectureView"
import { useNavStore } from "@/stores/nav-store"
import { buildFolderBreadcrumb } from "@/lib/breadcrumb"
import type { LectureContent, Lecture, ProcessingEvent } from "@/types"

type BreadcrumbItem = { id: string; name: string }

type PageState =
  | { stage: "loading" }
  | { stage: "processing"; events: ProcessingEvent[]; partialContent: Partial<LectureContent> }
  | { stage: "ready"; lecture: Lecture; content: LectureContent }
  | { stage: "error"; message: string }

export default function LecturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [state, setState] = useState<PageState>({ stage: "loading" })
  const { pendingBreadcrumb, clearPendingBreadcrumb } = useNavStore()
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>(pendingBreadcrumb)

  useEffect(() => {
    clearPendingBreadcrumb()
    let cancelled = false

    async function processLecture() {
      const lectureRes = await fetch(`/api/lectures/${id}`)
      if (!lectureRes.ok) {
        setState({ stage: "error", message: "Lecture not found." })
        return
      }
      const lecture: Lecture = await lectureRes.json()

      // Fetch breadcrumb from folder chain (updates the pre-seeded value)
      if (lecture.folderId) {
        buildFolderBreadcrumb(lecture.folderId).then(setBreadcrumb)
      }

      // If already completed, fetch content directly
      if (lecture.processingStatus === "completed") {
        const contentRes = await fetch(`/api/lectures/${id}/content`)
        if (contentRes.ok) {
          const content: LectureContent = await contentRes.json()
          if (!cancelled) setState({ stage: "ready", lecture, content })
          return
        }
      }

      if (lecture.processingStatus === "failed") {
        setState({ stage: "error", message: lecture.errorMessage ?? "Processing failed." })
        return
      }

      // Stream processing events
      setState({ stage: "processing", events: [], partialContent: {} })

      const eventSource = new EventSource(`/api/lectures/${id}/stream`)
      const events: ProcessingEvent[] = []
      const partialContent: Partial<LectureContent> = {}

      eventSource.onmessage = (e) => {
        if (cancelled) { eventSource.close(); return }

        try {
          const event: ProcessingEvent = JSON.parse(e.data)
          events.push(event)

          // Build partial content as events arrive
          if (event.type === "outline_done") partialContent.outline = event.outline
          if (event.type === "flashcards_done") partialContent.flashcards = event.flashcards
          if (event.type === "summary_90s_done") partialContent.summary90s = event.paragraphs
          if (event.type === "summary_5min_done") partialContent.summary5min = event.paragraphs
          if (event.type === "summary_full_done") partialContent.summaryFull = event.paragraphs

          setState({ stage: "processing", events: [...events], partialContent: { ...partialContent } })

          if (event.type === "completed") {
            eventSource.close()
            // Fetch final complete content
            fetch(`/api/lectures/${id}/content`).then(async (r) => {
              if (r.ok && !cancelled) {
                const content: LectureContent = await r.json()
                const updatedLecture = { ...lecture, processingStatus: "completed" as const }
                setState({ stage: "ready", lecture: updatedLecture, content })
              }
            })
          }

          if (event.type === "error") {
            eventSource.close()
            setState({ stage: "error", message: event.message })
          }
        } catch {
          // Ignore malformed events
        }
      }

      eventSource.onerror = () => {
        if (!cancelled) {
          eventSource.close()
          setState({ stage: "error", message: "Connection lost during processing. Refresh to try again." })
        }
      }

      return () => { eventSource.close() }
    }

    processLecture()
    return () => { cancelled = true }
  }, [id])

  if (state.stage === "loading") {
    return (
      <div className="flex min-h-full items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    )
  }

  if (state.stage === "error") {
    return (
      <div className="flex min-h-full items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-destructive font-medium">Something went wrong</p>
          <p className="text-muted-foreground text-sm">{state.message}</p>
          <a href="/" className="text-sm underline text-muted-foreground hover:text-foreground">
            ← Try a different URL
          </a>
        </div>
      </div>
    )
  }

  if (state.stage === "processing") {
    return <ProcessingView lectureId={id} events={state.events} partialContent={state.partialContent} />
  }

  return <LectureView lecture={state.lecture} content={state.content} breadcrumb={breadcrumb} />
}
