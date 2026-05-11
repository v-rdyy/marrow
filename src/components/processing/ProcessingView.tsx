"use client"

import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle2, Circle, Loader2 } from "lucide-react"
import type { ProcessingEvent, LectureContent } from "@/types"

type Step = {
  key: string
  label: string
  eventDone: ProcessingEvent["type"]
}

const STEPS: Step[] = [
  { key: "ingest", label: "Transcript extracted", eventDone: "ingest_done" },
  { key: "outline", label: "Outline", eventDone: "outline_done" },
  { key: "flashcards", label: "Flashcards", eventDone: "flashcards_done" },
  { key: "summary_90s", label: "Summary (90s)", eventDone: "summary_90s_done" },
  { key: "summary_5min", label: "Summary (5 min)", eventDone: "summary_5min_done" },
  { key: "summary_full", label: "Full summary", eventDone: "summary_full_done" },
  { key: "embed", label: "Search index", eventDone: "embed_done" },
]

export function ProcessingView({
  events,
  partialContent,
}: {
  lectureId: string
  events: ProcessingEvent[]
  partialContent: Partial<LectureContent>
}) {
  const completedTypes = new Set(events.map((e) => e.type))

  const ingestEvent = events.find((e) => e.type === "ingest_done") as
    | Extract<ProcessingEvent, { type: "ingest_done" }>
    | undefined

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg space-y-8"
      >
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {ingestEvent?.title ?? "Processing your lecture..."}
          </h1>
          {ingestEvent && (
            <p className="text-sm text-muted-foreground">
              {ingestEvent.channelName} · {formatDuration(ingestEvent.durationSeconds)}
            </p>
          )}
        </div>

        <div className="space-y-3">
          {STEPS.map((step, i) => {
            const done = completedTypes.has(step.eventDone)
            const active = !done && isStepActive(step, completedTypes, i)

            return (
              <motion.div
                key={step.key}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3"
              >
                <span className="flex-shrink-0">
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground/30" />
                  )}
                </span>
                <span
                  className={`text-sm ${done ? "text-foreground" : active ? "text-foreground" : "text-muted-foreground/50"}`}
                >
                  {step.label}
                </span>
                {done && (
                  <AnimatePresence>
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="ml-auto text-xs text-muted-foreground"
                    >
                      done
                    </motion.span>
                  </AnimatePresence>
                )}
              </motion.div>
            )
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          Tabs become active as they complete — no need to wait.
        </p>
      </motion.div>
    </main>
  )
}

function isStepActive(step: Step, completedTypes: Set<string>, stepIndex: number): boolean {
  if (stepIndex === 0) return !completedTypes.has("ingest_done")
  return completedTypes.has("content_start") && !completedTypes.has(step.eventDone)
}

function formatDuration(seconds: number): string {
  if (!seconds) return ""
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}
