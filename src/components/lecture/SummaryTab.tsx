"use client"

import { useMemo } from "react"
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import remarkGfm from "remark-gfm"
import "katex/dist/katex.min.css"
import { ClaimSource } from "./ClaimSource"
import { useUIStore } from "@/stores/ui-store"
import type { SummaryParagraph, SummaryDepth, LectureContent, Chunk } from "@/types"

interface Props {
  content: LectureContent
}

const DEPTHS: { key: SummaryDepth; label: string }[] = [
  { key: "90s", label: "90 sec" },
  { key: "5min", label: "5 min" },
  { key: "full", label: "Full" },
]

// Renders one summary section with timestamps injected after the last sentence
function SectionBlock({
  para,
  chunks,
}: {
  para: SummaryParagraph
  chunks: Chunk[]
}) {
  const badges = useMemo(() => {
    if (!para.sourceChunkIds?.length) return null
    return (
      <span className="inline-flex flex-wrap gap-1 align-middle ml-1">
        {para.sourceChunkIds.map((chunkId) => {
          const chunk = chunks.find((c) => c.id === chunkId)
          return chunk ? <ClaimSource key={chunkId} timestamp={chunk.start} /> : null
        })}
      </span>
    )
  }, [para.sourceChunkIds, chunks])

  // Count top-level "blocks" in the markdown to know when we're on the last paragraph
  const blockCount = useMemo(() => {
    return para.text.split(/\n\n+/).filter((s) => s.trim()).length || 1
  }, [para.text])

  let rendered = 0

  return (
    <div className="
      prose prose-invert max-w-none
      prose-headings:font-semibold
      prose-h2:text-base prose-h2:mt-0 prose-h2:mb-2
      prose-h3:text-sm prose-h3:mt-0 prose-h3:mb-1.5
      prose-p:text-sm prose-p:leading-7 prose-p:my-1.5
      prose-ul:my-1.5 prose-ul:pl-5
      prose-ol:my-1.5 prose-ol:pl-5
      prose-li:text-sm prose-li:leading-7 prose-li:my-0.5
      prose-strong:font-semibold prose-strong:text-foreground
      prose-em:text-muted-foreground
      prose-code:text-xs prose-code:bg-muted/60 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-mono
      [&_.katex]:text-base
      [&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto
    ">
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Inject timestamps inline at the end of the last paragraph
          p({ children }) {
            rendered++
            const isLast = rendered >= blockCount
            return (
              <p>
                {children}
                {isLast && badges}
              </p>
            )
          },
          // If the section ends with a list, inject after the last list item
          li({ children, node, ...props }) {
            const parent = (node as { parent?: { children?: unknown[] } })?.parent
            const siblings = parent?.children ?? []
            const isLastItem = siblings[siblings.length - 1] === node
            // Only inject if this list is the last block-level element
            const isLastBlock = rendered >= blockCount - 1
            return (
              <li {...props}>
                {children}
                {isLastItem && isLastBlock && badges}
              </li>
            )
          },
        }}
      >
        {para.text}
      </ReactMarkdown>
    </div>
  )
}

export function SummaryTab({ content }: Props) {
  const { activeSummaryDepth, setActiveSummaryDepth } = useUIStore()

  const summaryMap: Record<SummaryDepth, SummaryParagraph[]> = {
    "90s": content.summary90s,
    "5min": content.summary5min,
    "full": content.summaryFull,
  }

  const chunks = content.chunks ?? []
  const paragraphs = summaryMap[activeSummaryDepth] ?? []

  return (
    <div className="flex flex-col h-full">
      {/* Depth toggle */}
      <div className="flex gap-1 px-6 py-3 border-b shrink-0">
        {DEPTHS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveSummaryDepth(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              activeSummaryDepth === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content — centered, prose-width */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
          {paragraphs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Summary not available.</p>
          ) : (
            paragraphs.map((para, i) => (
              <SectionBlock key={i} para={para} chunks={chunks} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
