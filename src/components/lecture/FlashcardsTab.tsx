"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { ClaimSource } from "./ClaimSource"
import type { Flashcard } from "@/types"

interface Props {
  flashcards: Flashcard[]
}

export function FlashcardsTab({ flashcards }: Props) {
  if (flashcards.length === 0) {
    return <p className="text-sm text-muted-foreground p-4">No flashcards available.</p>
  }

  return (
    <div className="grid grid-cols-4 gap-2 p-3">
      {flashcards.map((card) => (
        <FlashcardItem key={card.id} card={card} />
      ))}
    </div>
  )
}

function FlashcardItem({ card }: { card: Flashcard }) {
  const [flipped, setFlipped] = useState(false)

  return (
    <div
      className="relative cursor-pointer select-none"
      style={{ perspective: 1000, aspectRatio: "1 / 1" }}
      onClick={() => setFlipped((f) => !f)}
    >
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.35 }}
        style={{ transformStyle: "preserve-3d" }}
        className="absolute inset-0"
      >
        {/* Front */}
        <div
          className="absolute inset-0 rounded-lg border bg-card p-3 flex flex-col justify-between"
          style={{ backfaceVisibility: "hidden" }}
        >
          <p className="text-xs font-medium leading-snug line-clamp-5">{card.question}</p>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-muted-foreground/60">tap to flip</span>
            <ClaimSource timestamp={card.timestamp} />
          </div>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 rounded-lg border border-primary/20 bg-primary/5 p-3 flex flex-col justify-between"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <p className="text-xs leading-snug line-clamp-5">{card.answer}</p>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-muted-foreground/60">tap to flip</span>
            <ClaimSource timestamp={card.timestamp} />
          </div>
        </div>
      </motion.div>
    </div>
  )
}
