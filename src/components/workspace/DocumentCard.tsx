"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { MoreHorizontal, Trash2, MoveRight, Palette, FileText } from "lucide-react"
import type { Document } from "@/types"
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
  doc: Document
  onDelete: () => void
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

function stripHtml(html: string) {
  return (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

export function DocumentCard({ doc, onDelete, onMove, onColorChange, onRename, navBreadcrumb = [] }: Props) {
  const router = useRouter()
  const { setPendingBreadcrumb } = useNavStore()
  const isPdf = doc.type === "pdf"
  const preview = isPdf ? "" : stripHtml(doc.content)
  const [pdfThumbnail, setPdfThumbnail] = useState<string | null>(null)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameValue, setNameValue] = useState(doc.title)
  const inputRef = useRef<HTMLInputElement>(null)

  const cardColor = doc.color ?? itemColor(doc.id)

  useEffect(() => {
    if (!isPdf || !doc.fileUrl) return
    let cancelled = false
    ;(async () => {
      try {
        const pdfjs = await import("pdfjs-dist")
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
        const pdf = await pdfjs.getDocument({ url: doc.fileUrl!, withCredentials: false }).promise
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 1 })
        const scale = 320 / viewport.width
        const scaled = page.getViewport({ scale })
        const canvas = document.createElement("canvas")
        canvas.width = scaled.width
        canvas.height = scaled.height
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.render({ canvasContext: canvas.getContext("2d")!, viewport: scaled } as any).promise
        if (!cancelled) setPdfThumbnail(canvas.toDataURL("image/jpeg", 0.85))
      } catch { /* fall back to icon */ }
    })()
    return () => { cancelled = true }
  }, [isPdf, doc.fileUrl])

  function handleClick() {
    if (renaming) return
    setPendingBreadcrumb(navBreadcrumb)
    router.push(isPdf ? `/pdf/${doc.id}` : `/document/${doc.id}`)
  }

  function startRename(e: React.MouseEvent) {
    e.stopPropagation()
    setNameValue(doc.title)
    setRenaming(true)
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 30)
  }

  function commitRename() {
    setRenaming(false)
    const trimmed = nameValue.trim()
    if (trimmed && trimmed !== doc.title) onRename?.(trimmed)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); commitRename() }
    if (e.key === "Escape") { setRenaming(false); setNameValue(doc.title) }
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
        {isPdf && pdfThumbnail ? (
          /* Full-bleed PDF thumbnail */
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pdfThumbnail} alt="" className="absolute inset-0 w-full h-full object-cover object-top" />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.2) 40%, transparent 70%)" }} />
            <div className="absolute bottom-0 left-0 right-0 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
              {renaming ? (
                <input ref={inputRef} value={nameValue} onChange={(e) => setNameValue(e.target.value)} onBlur={commitRename} onKeyDown={onKeyDown} onClick={(e) => e.stopPropagation()} className="w-full text-sm font-semibold bg-transparent outline-none border-b text-white border-white/40 placeholder:text-white/40" placeholder="Untitled" />
              ) : (
                <p className="text-sm font-semibold text-white leading-snug line-clamp-2 cursor-text hover:underline decoration-dotted underline-offset-2" onClick={startRename} title="Click to rename">{doc.title || "Untitled"}</p>
              )}
              <span className="text-[10px] font-bold tracking-widest text-white/40 uppercase">PDF</span>
            </div>
          </>
        ) : isPdf ? (
          /* PDF loading — colored fallback */
          <div className="absolute inset-0 flex flex-col justify-end p-3" style={{ backgroundColor: hexToRgba(cardColor, 0.12) }}>
            <FileText className="h-8 w-8 mb-auto mt-3" style={{ color: hexToRgba(cardColor, 0.5) }} strokeWidth={1} />
            <div onClick={(e) => e.stopPropagation()}>
              {renaming ? (
                <input ref={inputRef} value={nameValue} onChange={(e) => setNameValue(e.target.value)} onBlur={commitRename} onKeyDown={onKeyDown} onClick={(e) => e.stopPropagation()} className="w-full text-sm font-semibold bg-transparent outline-none border-b text-foreground border-foreground/30" placeholder="Untitled" />
              ) : (
                <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2 cursor-text hover:underline decoration-dotted underline-offset-2" onClick={startRename} title="Click to rename">{doc.title || "Untitled"}</p>
              )}
            </div>
            <span className="text-[10px] font-bold tracking-widest text-muted-foreground/50 uppercase mt-0.5">PDF</span>
          </div>
        ) : (
          /* Text document */
          <div className="absolute inset-0 flex flex-col" style={{ backgroundColor: hexToRgba(cardColor, 0.12) }}>
            <div className="flex-1 px-3 pt-3 overflow-hidden min-h-0">
              {preview ? (
                <p className="text-[10px] text-muted-foreground/80 leading-relaxed break-words line-clamp-[8]">
                  {preview.slice(0, 400)}
                </p>
              ) : (
                <FileText className="h-8 w-8 text-muted-foreground/20 mt-1" strokeWidth={1} />
              )}
            </div>
            <div className="px-3 py-2.5 shrink-0" onClick={(e) => e.stopPropagation()}>
              {renaming ? (
                <input ref={inputRef} value={nameValue} onChange={(e) => setNameValue(e.target.value)} onBlur={commitRename} onKeyDown={onKeyDown} onClick={(e) => e.stopPropagation()} className="w-full text-sm font-semibold bg-transparent outline-none border-b text-foreground border-foreground/30" placeholder="Untitled" />
              ) : (
                <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2 cursor-text hover:underline decoration-dotted underline-offset-2" onClick={startRename} title="Click to rename">{doc.title || "Untitled"}</p>
              )}
            </div>
          </div>
        )}

        {/* Kebab */}
        <div
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              className="rounded-md p-1.5 transition-colors"
              style={{ backgroundColor: isPdf && pdfThumbnail ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.15)" }}
            >
              <MoreHorizontal className="h-3.5 w-3.5" style={{ color: isPdf && pdfThumbnail ? "rgba(255,255,255,0.8)" : undefined }} />
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
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
              </DropdownMenuItem>
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
