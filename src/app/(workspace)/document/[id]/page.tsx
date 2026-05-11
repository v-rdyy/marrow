"use client"

import { use, useEffect, useState, useCallback, useRef } from "react"
import { ArrowLeft, Check, Loader2, Bot, ChevronRight, BookOpen, Folder as FolderIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { DocumentEditor } from "@/components/editor/DocumentEditor"
import { useContextStore } from "@/stores/context-store"
import { buildFolderBreadcrumb, type BreadcrumbItem } from "@/lib/breadcrumb"
import { useNavStore } from "@/stores/nav-store"
import type { Document } from "@/types"

type SaveState = "idle" | "saving" | "saved"

function stripHtml(html: string) {
  return (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

export default function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [doc, setDoc] = useState<Document | null>(null)
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [docId, setDocId] = useState<string | null>(null)
  const { pendingBreadcrumb, clearPendingBreadcrumb } = useNavStore()
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>(pendingBreadcrumb)

  // Text selection popup position
  const [selectionPopup, setSelectionPopup] = useState<{ x: number; y: number; text: string } | null>(null)

  const { add, remove } = useContextStore()

  useEffect(() => {
    clearPendingBreadcrumb()
    fetch(`/api/documents/${id}`)
      .then((r) => r.json())
      .then((data) => {
        const document = data.document ?? null
        setDoc(document)
        setLoading(false)
        if (document?.id) setDocId(document.id)
        if (document?.folderId) {
          buildFolderBreadcrumb(document.folderId).then(setBreadcrumb)
        }
      })
      .catch(() => setLoading(false))
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Remove from context on unmount
  useEffect(() => {
    if (!docId) return
    return () => { remove(docId) }
  }, [docId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep context in sync as the document is edited
  useEffect(() => {
    if (!docId || !doc) return
    add({
      id: docId,
      type: "document",
      label: doc.title || "Untitled",
      content: stripHtml(doc.content),
      isPriority: true,
    })
  }, [docId, doc?.title, doc?.content]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(
    async (title: string, content: string) => {
      setSaveState("saving")
      await fetch(`/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      })
      setSaveState("saved")
      setTimeout(() => setSaveState("idle"), 2000)
    },
    [id]
  )

  const handleContentChange = useCallback(
    (html: string) => {
      setDoc((prev) => (prev ? { ...prev, content: html } : prev))
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        setDoc((prev) => {
          if (prev) save(prev.title, html)
          return prev
        })
      }, 1000)
    },
    [save]
  )

  const handleTitleChange = useCallback(
    (title: string) => {
      setDoc((prev) => (prev ? { ...prev, title } : prev))
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        setDoc((prev) => {
          if (prev) save(title, prev.content)
          return prev
        })
      }, 800)
    },
    [save]
  )

  // Text selection → floating Ask AI button
  useEffect(() => {
    function handleMouseUp(e: MouseEvent) {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) { setSelectionPopup(null); return }
      const text = sel.toString().trim()
      if (!text || text.length < 5) { setSelectionPopup(null); return }
      setSelectionPopup({ x: e.clientX, y: e.clientY - 44, text })
    }
    function handleMouseDown() { setSelectionPopup(null) }
    document.addEventListener("mouseup", handleMouseUp)
    document.addEventListener("mousedown", handleMouseDown)
    return () => {
      document.removeEventListener("mouseup", handleMouseUp)
      document.removeEventListener("mousedown", handleMouseDown)
    }
  }, [])

  function addSelectionToContext() {
    if (!selectionPopup) return
    const selId = `sel-${Date.now()}`
    add({
      id: selId,
      type: "text-selection",
      label: selectionPopup.text.slice(0, 40) + (selectionPopup.text.length > 40 ? "…" : ""),
      content: selectionPopup.text,
      isPriority: true,
    })
    setSelectionPopup(null)
    window.getSelection()?.removeAllRanges()
  }

  if (!loading && !doc) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-3">
        <p className="text-muted-foreground">Document not found</p>
        <button onClick={() => router.back()} className="text-sm underline text-muted-foreground hover:text-foreground">← Back</button>
      </div>
    )
  }

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
        ) : (
          <input
            value={doc!.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="flex-1 text-sm font-medium bg-transparent border-none outline-none focus:ring-0 placeholder:text-muted-foreground min-w-0"
            placeholder="Untitled"
          />
        )}

        {!loading && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            {saveState === "saving" && <><Loader2 className="h-3 w-3 animate-spin" /> Saving</>}
            {saveState === "saved" && <><Check className="h-3 w-3 text-green-500" /> Saved</>}
          </div>
        )}
      </header>

      {/* Editor */}
      <div className="flex-1 overflow-hidden min-h-0">
        <div className="flex-1 min-w-0 overflow-y-auto relative h-full">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <DocumentEditor content={doc!.content} onChange={handleContentChange} className="h-full" />
          )}

          {selectionPopup && (
            <div className="fixed z-50" style={{ left: selectionPopup.x, top: selectionPopup.y }}>
              <button
                onMouseDown={(e) => { e.preventDefault(); addSelectionToContext() }}
                className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium shadow-xl hover:bg-primary/90 transition-colors whitespace-nowrap"
              >
                <Bot className="h-3 w-3" />
                Ask AI
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
