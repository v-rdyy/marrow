"use client"

import { use, useEffect, useState, useRef, useCallback } from "react"
import { ArrowLeft, Bot, Loader2, ChevronLeft, ChevronRight, BookOpen, Folder as FolderIcon, Camera } from "lucide-react"
import { useRouter } from "next/navigation"
import { Document as PdfDocument, Page as PdfPage, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/TextLayer.css"
import "react-pdf/dist/Page/AnnotationLayer.css"
import { useContextStore } from "@/stores/context-store"
import { buildFolderBreadcrumb, type BreadcrumbItem } from "@/lib/breadcrumb"
import { useNavStore } from "@/stores/nav-store"
import { useScreenshotStore } from "@/stores/screenshot-store"
import { RegionCapture } from "@/components/shared/RegionCapture"
import type { Document } from "@/types"

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"

function PageNavigator({
  currentPage,
  numPages,
  onPageChange,
}: {
  currentPage: number
  numPages: number
  onPageChange: (page: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(currentPage))
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep display in sync when scrolling changes currentPage
  useEffect(() => {
    if (!editing) setVal(String(currentPage))
  }, [currentPage, editing])

  // Focus + select after entering edit mode
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function startEdit() {
    setVal(String(currentPage))
    setEditing(true)
  }

  function commit() {
    const n = parseInt(val, 10)
    const clamped = isNaN(n) ? currentPage : Math.min(Math.max(n, 1), numPages)
    onPageChange(clamped)
    setEditing(false)
  }

  return (
    <div
      className="flex items-center gap-0.5 rounded-full px-2 py-1.5 shadow-2xl"
      style={{ background: "oklch(0.22 0 0 / 0.92)", border: "1px solid oklch(1 0 0 / 0.1)", backdropFilter: "blur(12px)" }}
    >
      <button
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage <= 1}
        className="flex h-6 w-6 items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-center gap-1.5 px-1 min-w-[72px] justify-center">
        {editing ? (
          <input
            ref={inputRef}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commit() }
              if (e.key === "Escape") { setEditing(false); setVal(String(currentPage)) }
            }}
            className="w-10 text-center rounded-md outline-none text-sm font-medium text-white py-0.5 px-1 tabular-nums"
            style={{ background: "oklch(1 0 0 / 0.12)" }}
          />
        ) : (
          <button
            onClick={startEdit}
            className="rounded-md px-1.5 py-0.5 text-sm font-medium text-white hover:bg-white/10 transition-colors tabular-nums"
          >
            {currentPage}
          </button>
        )}
        <span className="text-white/40 text-xs font-medium">/ {numPages}</span>
      </div>

      <button
        onClick={() => onPageChange(Math.min(numPages, currentPage + 1))}
        disabled={currentPage >= numPages}
        className="flex h-6 w-6 items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export default function PdfViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [doc, setDoc] = useState<Document | null>(null)
  const [loading, setLoading] = useState(true)
  const [docId, setDocId] = useState<string | null>(null)
  const { pendingBreadcrumb, clearPendingBreadcrumb } = useNavStore()
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>(pendingBreadcrumb)

  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pdfWidth, setPdfWidth] = useState(0)
  const [renamingTitle, setRenamingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState("")
  const titleInputRef = useRef<HTMLInputElement>(null)

  const pdfContainerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const [selectionPopup, setSelectionPopup] = useState<{ x: number; y: number; text: string } | null>(null)
  const [screenshotMode, setScreenshotMode] = useState(false)
  const { setPendingScreenshot } = useScreenshotStore()

  const { add, remove } = useContextStore()

  // Measure container → fill it
  useEffect(() => {
    function measure() {
      if (pdfContainerRef.current) {
        setPdfWidth(pdfContainerRef.current.clientWidth - 32)
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (pdfContainerRef.current) ro.observe(pdfContainerRef.current)
    return () => ro.disconnect()
  }, [])

  // Scroll to a specific page inside the overflow container
  function scrollToPage(page: number) {
    const el = pageRefs.current.get(page)
    const container = pdfContainerRef.current
    if (!el || !container) return
    const containerTop = container.getBoundingClientRect().top
    const elTop = el.getBoundingClientRect().top
    container.scrollTo({ top: container.scrollTop + (elTop - containerTop) - 24, behavior: "smooth" })
  }

  // Track visible page via IntersectionObserver
  useEffect(() => {
    if (!numPages || !pdfContainerRef.current) return
    const ratios = new Map<number, number>()
    const observers: IntersectionObserver[] = []

    for (let i = 1; i <= numPages; i++) {
      const el = pageRefs.current.get(i)
      if (!el) continue
      const pageNum = i
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) ratios.set(pageNum, entry.intersectionRatio)
          else ratios.delete(pageNum)
          // The most-visible page wins
          let best = currentPage
          let bestR = -1
          ratios.forEach((r, p) => { if (r > bestR) { bestR = r; best = p } })
          setCurrentPage(best)
        },
        { root: pdfContainerRef.current, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }
      )
      obs.observe(el)
      observers.push(obs)
    }
    return () => observers.forEach((o) => o.disconnect())
  }, [numPages]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch doc
  useEffect(() => {
    clearPendingBreadcrumb()
    fetch(`/api/documents/${id}`)
      .then((r) => r.json())
      .then((data) => {
        const doc = data.document ?? null
        setDoc(doc)
        setLoading(false)
        if (doc?.id) setDocId(doc.id)
        if (doc?.folderId) {
          buildFolderBreadcrumb(doc.folderId).then(setBreadcrumb)
        }
      })
      .catch(() => setLoading(false))
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!docId || !doc) return
    add({
      id: docId,
      type: "document",
      label: doc.title || "Untitled PDF",
      isPriority: true,
      // No pre-baked content — read_document will return the extracted text from the DB
    })
    return () => { remove(docId) }
  }, [docId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Text selection → Ask AI popup
  useEffect(() => {
    function onUp(e: MouseEvent) {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) { setSelectionPopup(null); return }
      const text = sel.toString().trim()
      if (text.length < 5) { setSelectionPopup(null); return }
      setSelectionPopup({ x: e.clientX, y: e.clientY - 44, text })
    }
    function onDown(e: MouseEvent) {
      // Don't clear if clicking the popup button itself
      const target = e.target as HTMLElement
      if (target.closest("[data-ask-ai]")) return
      setSelectionPopup(null)
    }
    document.addEventListener("mouseup", onUp)
    document.addEventListener("mousedown", onDown)
    return () => { document.removeEventListener("mouseup", onUp); document.removeEventListener("mousedown", onDown) }
  }, [])

  const addSelectionToContext = useCallback(() => {
    if (!selectionPopup) return
    add({
      id: `sel-${Date.now()}`,
      type: "text-selection",
      label: selectionPopup.text.slice(0, 40) + (selectionPopup.text.length > 40 ? "…" : ""),
      content: selectionPopup.text,
      isPriority: true,
    })
    setSelectionPopup(null)
    window.getSelection()?.removeAllRanges()
  }, [selectionPopup, add])

  if (!loading && (!doc || !doc.fileUrl)) return (
    <div className="flex h-full items-center justify-center flex-col gap-3">
      <p className="text-muted-foreground">PDF not found</p>
      <button onClick={() => router.back()} className="text-sm underline text-muted-foreground hover:text-foreground">← Back</button>
    </div>
  )

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header — shown immediately with pre-seeded breadcrumb */}
      <header className="flex items-center gap-1.5 px-4 py-2 border-b bg-sidebar shrink-0 h-11 overflow-hidden">
        <button
          onClick={() => router.back()}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <button onClick={() => router.push("/")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <BookOpen className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Marrow</span>
        </button>
        {breadcrumb.map((item) => (
          <span key={item.id} className="flex items-center gap-1 shrink-0">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
            <button
              onClick={() => router.push(`/workspace/${item.id}`)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <FolderIcon className="h-3 w-3" />
              {item.name}
            </button>
          </span>
        ))}
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />

        {loading ? (
          <div className="flex-1 h-3.5 max-w-48 bg-muted animate-pulse rounded-full min-w-0" />
        ) : renamingTitle ? (
          <input
            ref={titleInputRef}
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={async () => {
              setRenamingTitle(false)
              const trimmed = titleValue.trim()
              if (trimmed && trimmed !== doc!.title) {
                setDoc((prev) => prev ? { ...prev, title: trimmed } : prev)
                await fetch(`/api/documents/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title: trimmed }),
                })
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); titleInputRef.current?.blur() }
              if (e.key === "Escape") { setRenamingTitle(false) }
            }}
            className="flex-1 text-sm font-medium bg-transparent outline-none border-b border-foreground/30 text-foreground min-w-0"
            placeholder="Untitled"
          />
        ) : (
          <span
            className="flex-1 text-sm font-medium truncate min-w-0 cursor-text hover:underline decoration-dotted underline-offset-2"
            title="Click to rename"
            onClick={() => { setTitleValue(doc!.title || ""); setRenamingTitle(true); setTimeout(() => { titleInputRef.current?.focus(); titleInputRef.current?.select() }, 30) }}
          >
            {doc!.title || "Untitled"}
          </span>
        )}
        <button
          onClick={() => setScreenshotMode(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-auto"
          title="Screenshot region"
        >
          <Camera className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Screenshot</span>
        </button>
        <span className="text-[10px] font-bold tracking-widest text-muted-foreground/40 uppercase shrink-0">PDF</span>
      </header>

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* PDF area */}
        <div ref={pdfContainerRef} className="flex-1 min-w-0 overflow-y-auto bg-[oklch(0.155_0_0)] relative">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center py-6 gap-4">
                <PdfDocument
                  file={doc!.fileUrl}
                  onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                  loading={<div className="flex flex-col items-center gap-3 py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /><p className="text-sm text-muted-foreground">Loading…</p></div>}
                  error={<p className="text-sm text-muted-foreground py-20">Could not load PDF.</p>}
                >
                  {Array.from({ length: numPages }, (_, i) => {
                    const n = i + 1
                    return (
                      <div
                        key={n}
                        ref={(el) => { if (el) pageRefs.current.set(n, el); else pageRefs.current.delete(n) }}
                        className="shadow-2xl"
                      >
                        <PdfPage pageNumber={n} width={pdfWidth > 0 ? pdfWidth : undefined} renderTextLayer renderAnnotationLayer={false} />
                      </div>
                    )
                  })}
                </PdfDocument>
              </div>

              {numPages > 1 && (
                <div className="sticky bottom-5 z-20 flex justify-center pointer-events-none pb-0">
                  <div className="pointer-events-auto">
                    <PageNavigator
                      currentPage={currentPage}
                      numPages={numPages}
                      onPageChange={(page) => { setCurrentPage(page); scrollToPage(page) }}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {selectionPopup && (
            <div data-ask-ai className="fixed z-50" style={{ left: selectionPopup.x, top: selectionPopup.y }}>
              <button
                onMouseDown={(e) => { e.preventDefault(); addSelectionToContext() }}
                className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium shadow-xl hover:bg-primary/90 transition-colors whitespace-nowrap"
              >
                <Bot className="h-3 w-3" /> Ask AI
              </button>
            </div>
          )}
        </div>

      </div>

      {screenshotMode && (
        <RegionCapture
          canvasContainer={pdfContainerRef.current}
          onCapture={(base64, mimeType) => {
            setPendingScreenshot({ base64, mimeType, name: `${doc?.title ?? "PDF"} screenshot.jpg` })
          }}
          onClose={() => setScreenshotMode(false)}
        />
      )}
    </div>
  )
}
