"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Plus, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { LectureCard } from "./LectureCard"
import type { Lecture } from "@/types"

interface Props {
  onAddLecture: () => void
}

export function LectureGrid({ onAddLecture }: Props) {
  const [lectures, setLectures] = useState<Lecture[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/lectures")
      .then((r) => r.json())
      .then((data) => { setLectures(data.lectures ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 p-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="aspect-video rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  if (lectures.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center p-8">
        <div className="rounded-full bg-muted p-4">
          <BookOpen className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="font-medium">No lectures yet</p>
          <p className="text-sm text-muted-foreground">Add a YouTube lecture to get started.</p>
        </div>
        <Button onClick={onAddLecture} className="gap-2">
          <Plus className="h-4 w-4" />
          Add your first lecture
        </Button>
      </div>
    )
  }

  return (
    <div className="p-6 overflow-y-auto flex-1">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {lectures.map((lecture) => (
          <LectureCard key={lecture.id} lecture={lecture} />
        ))}

        {/* Add more card */}
        <motion.button
          whileHover={{ y: -2 }}
          onClick={onAddLecture}
          className="flex flex-col items-center justify-center gap-2 aspect-video rounded-xl border-2 border-dashed border-muted-foreground/25 text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground transition-colors"
        >
          <Plus className="h-6 w-6" />
          <span className="text-sm">Add lecture</span>
        </motion.button>
      </div>
    </div>
  )
}
