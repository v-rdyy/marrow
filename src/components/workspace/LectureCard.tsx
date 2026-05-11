"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Play, Loader2, AlertCircle, CheckCircle2, MoreHorizontal, Trash2, MoveRight, Palette, PlayCircle } from "lucide-react"
import type { Lecture } from "@/types"
import { itemColor } from "@/types"
import { useNavStore } from "@/stores/nav-store"
import { ColorPicker } from "@/components/shared/ColorPicker"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface Props {
  lecture: Lecture
  onDelete?: () => void
  onMove?: () => void
  onColorChange?: (hex: string) => void
  onRename?: (title: string) => void
  navBreadcrumb?: { id: string; name: string }[]
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const SEEN_KEY = "marrow_seen_lectures"

function getSeenSet(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]")) } catch { return new Set() }
}
function markSeen(id: string) {
  try {
    const s = getSeenSet(); s.add(id)
    localStorage.setItem(SEEN_KEY, JSON.stringify([...s]))
  } catch { /* ignore */ }
}

export function LectureCard({ lecture, onDelete, onMove, onColorChange, onRename, navBreadcrumb = [] }: Props) {
  const router = useRouter()
  const { setPendingBreadcrumb } = useNavStore()
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameValue, setNameValue] = useState(lecture.title)
  const [seen, setSeen] = useState(() => getSeenSet().has(lecture.id))
  const inputRef = useRef<HTMLInputElement>(null)
  const isReady = lecture.processingStatus === "completed"
  const isProcessing = lecture.processingStatus === "processing" || lecture.processingStatus === "pending"
  const isFailed = lecture.processingStatus === "failed"

  const cardColor = lecture.color ?? itemColor(lecture.id)

  function handleClick() {
    if (renaming) return
    markSeen(lecture.id)
    setSeen(true)
    setPendingBreadcrumb(navBreadcrumb)
    router.push(`/lecture/${lecture.id}`)
  }

  function startRename(e: React.MouseEvent) {
    e.stopPropagation()
    setNameValue(lecture.title)
    setRenaming(true)
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 30)
  }

  function commitRename() {
    setRenaming(false)
    const trimmed = nameValue.trim()
    if (trimmed && trimmed !== lecture.title) onRename?.(trimmed)
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.015 }}
        transition={{ duration: 0.15 }}
        onClick={handleClick}
        className="group relative rounded-md cursor-pointer aspect-[4/3] overflow-hidden shadow-sm transition-shadow duration-200 hover:shadow-lg"
        style={{
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: hexToRgba(cardColor, 0.45),
        }}
      >
        {lecture.thumbnailUrl ? (
          /* Full-bleed YouTube thumbnail */
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lecture.thumbnailUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Bottom gradient for text readability */}
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.25) 45%, transparent 75%)" }}
            />
            {/* Title overlay */}
            <div className="absolute bottom-0 left-0 right-0 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
              {renaming ? (
                <input
                  ref={inputRef}
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitRename() } if (e.key === "Escape") { setRenaming(false); setNameValue(lecture.title) } }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full text-sm font-semibold bg-transparent outline-none border-b border-white/40 text-white placeholder:text-white/40"
                  placeholder="Untitled"
                />
              ) : (
                <p
                  className="text-sm font-semibold text-white leading-snug line-clamp-2 cursor-text hover:underline decoration-dotted underline-offset-2"
                  onClick={startRename}
                  title="Click to rename"
                >
                  {lecture.title || "Untitled"}
                </p>
              )}
              {lecture.channelName && (
                <p className="text-[11px] text-white/55 mt-0.5 truncate">{lecture.channelName}</p>
              )}
              {lecture.durationSeconds > 0 && (
                <p className="text-[10px] text-white/40 mt-0.5">{formatDuration(lecture.durationSeconds)}</p>
              )}
            </div>
          </>
        ) : (
          /* No thumbnail — translucent colored fallback */
          <div
            className="absolute inset-0 flex flex-col justify-end p-3"
            style={{ backgroundColor: hexToRgba(cardColor, 0.12) }}
          >
            <PlayCircle className="h-8 w-8 text-muted-foreground/20 mb-auto mt-3 ml-0.5" strokeWidth={1} />
            <div onClick={(e) => e.stopPropagation()}>
              {renaming ? (
                <input
                  ref={inputRef}
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitRename() } if (e.key === "Escape") { setRenaming(false); setNameValue(lecture.title) } }}
                  className="w-full text-sm font-semibold bg-transparent outline-none border-b border-foreground/30 text-foreground"
                  placeholder="Untitled"
                />
              ) : (
                <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2 cursor-text hover:underline decoration-dotted underline-offset-2" onClick={startRename}>
                  {lecture.title || "Untitled"}
                </p>
              )}
            </div>
            {lecture.channelName && (
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{lecture.channelName}</p>
            )}
          </div>
        )}

        {/* Play overlay on hover */}
        {isReady && lecture.thumbnailUrl && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="rounded-full bg-black/40 backdrop-blur-sm border border-white/20 p-3">
              <Play className="h-5 w-5 text-white fill-white" />
            </div>
          </div>
        )}

        {/* Status */}
        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-5 w-5 text-white/70 animate-spin" />
          </div>
        )}
        {isReady && !seen && <CheckCircle2 className="absolute bottom-2 left-2 h-3.5 w-3.5 text-emerald-400 drop-shadow" />}
        {isFailed && <AlertCircle className="absolute bottom-2 left-2 h-3.5 w-3.5 text-red-400 drop-shadow" />}

        {/* Kebab */}
        <div
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-md p-1.5 bg-black/40 hover:bg-black/60 transition-colors">
              <MoreHorizontal className="h-3.5 w-3.5 text-white/80" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {onMove && (
                <DropdownMenuItem onClick={onMove}>
                  <MoveRight className="h-3.5 w-3.5 mr-2" /> Move
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setColorPickerOpen(true)}>
                <Palette className="h-3.5 w-3.5 mr-2" /> Change Color
              </DropdownMenuItem>
              {onDelete && (
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.div>

      {colorPickerOpen && (
        <ColorPicker
          current={cardColor}
          onChange={(hex) => onColorChange?.(hex)}
          onClose={() => setColorPickerOpen(false)}
        />
      )}
    </>
  )
}
