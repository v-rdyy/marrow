"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  FileText, Folder as FolderIcon, Upload, PlayCircle,
  ChevronRight, BookOpen, Plus, Loader2, ArrowLeft,
  Check, CheckCircle2, Trash2, MoveRight, X,
} from "lucide-react"
import { FolderCard } from "./FolderCard"
import { LectureCard } from "./LectureCard"
import { DocumentCard } from "./DocumentCard"
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog"
import { AddLectureDialog } from "./AddLectureDialog"
import { useContextStore } from "@/stores/context-store"
import { useChatStore } from "@/stores/chat-store"
import { useNavStore } from "@/stores/nav-store"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Folder, Lecture, Document, ProcessingEvent } from "@/types"

interface BreadcrumbItem {
  id: string
  name: string
}

interface Props {
  workspaceId: string
  workspaceName: string
  breadcrumb?: BreadcrumbItem[]
}

function stripHtml(html: string) {
  return (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

export function WorkspaceInterior({ workspaceId, workspaceName, breadcrumb = [] }: Props) {
  const router = useRouter()
  const [folders, setFolders] = useState<Folder[]>([])
  const [lectures, setLectures] = useState<Lecture[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [addLectureOpen, setAddLectureOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const dragCounterRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Selection state: id → type
  const [selected, setSelected] = useState<Map<string, "folder" | "lecture" | "document">>(new Map())
  const [moveOpen, setMoveOpen] = useState(false)
  const [allFolders, setAllFolders] = useState<Folder[]>([])
  // Single-item move (from card kebab)
  const [moveTarget, setMoveTarget] = useState<{ id: string; type: "folder" | "lecture" | "document"; label: string } | null>(null)
  const [moveSearch, setMoveSearch] = useState("")
  // Right-click context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const selectionActive = selected.size > 0

  // Context store
  const { add: addContext, remove: removeContext, setWorkspaceItems } = useContextStore()
  const { setPendingBreadcrumb } = useNavStore()

  function toggleSelect(id: string, type: "folder" | "lecture" | "document", e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    // Never call Zustand setters inside a React state updater — do them all at the call site
    if (selected.has(id)) {
      const next = new Map(selected)
      next.delete(id)
      setSelected(next)
      removeContext(`selected-${id}`)
    } else {
      const next = new Map(selected)
      next.set(id, type)
      setSelected(next)
      const label =
        type === "folder"
          ? folders.find((f) => f.id === id)?.name
          : type === "lecture"
          ? lectures.find((l) => l.id === id)?.title
          : documents.find((d) => d.id === id)?.title
      addContext({
        id: `selected-${id}`,
        type: type === "lecture" ? "lecture" : type === "folder" ? "folder" : "document",
        label: label ?? id,
        isPriority: true,
        ...(type === "document" && {
          content: stripHtml(documents.find((d) => d.id === id)?.content ?? ""),
        }),
      })
    }
  }

  function clearSelection() {
    selected.forEach((_, id) => removeContext(`selected-${id}`))
    setSelected(new Map())
  }

  async function deleteSelected() {
    const ops = Array.from(selected.entries()).map(([id, type]) => {
      const path = type === "folder" ? "folders" : type === "lecture" ? "lectures" : "documents"
      return fetch(`/api/${path}/${id}`, { method: "DELETE" })
    })
    await Promise.all(ops)
    const ids = new Set(selected.keys())
    setFolders((p) => p.filter((f) => !ids.has(f.id)))
    setLectures((p) => p.filter((l) => !ids.has(l.id)))
    setDocuments((p) => p.filter((d) => !ids.has(d.id)))
    clearSelection()
  }

  async function moveSingleItem(targetFolderId: string) {
    if (!moveTarget) return
    const { id, type } = moveTarget
    const path = type === "folder" ? "folders" : type === "lecture" ? "lectures" : "documents"
    const key = type === "folder" ? "parentId" : "folderId"
    await fetch(`/api/${path}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: targetFolderId }),
    })
    setMoveTarget(null)
    setMoveSearch("")
    refresh()
  }

  async function moveSelected(targetFolderId: string) {
    const ops = Array.from(selected.entries()).map(([id, type]) => {
      if (type === "folder") {
        return fetch(`/api/folders/${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentId: targetFolderId }),
        })
      } else if (type === "lecture") {
        return fetch(`/api/lectures/${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: targetFolderId }),
        })
      } else {
        return fetch(`/api/documents/${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: targetFolderId }),
        })
      }
    })
    await Promise.all(ops)
    refresh()
    clearSelection()
    setMoveOpen(false)
  }

  useEffect(() => {
    if (moveOpen || moveTarget) {
      fetch("/api/folders?all=true")
        .then((r) => r.json())
        .then((d) => setAllFolders(d.folders ?? []))
        .catch(() => {})
    }
  }, [moveOpen, moveTarget])

  // Processing card state
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [processingEvents, setProcessingEvents] = useState<ProcessingEvent[]>([])

  useEffect(() => {
    if (!processingId) return
    const es = new EventSource(`/api/lectures/${processingId}/stream`)
    es.onmessage = (e) => {
      try {
        const event: ProcessingEvent = JSON.parse(e.data)
        setProcessingEvents((prev) => [...prev, event])
        if (event.type === "completed") {
          es.close()
          const completingId = processingId
          fetch(`/api/lectures/${completingId}`)
            .then((r) => r.json())
            .then((lecture: Lecture) => {
              setTimeout(() => {
                if (lecture?.id) {
                  setLectures((prev) => prev.find((l) => l.id === lecture.id) ? prev : [...prev, lecture])
                }
                setProcessingId(null)
                setProcessingEvents([])
              }, 1500)
            })
            .catch(() => {
              setTimeout(() => { setProcessingId(null); setProcessingEvents([]); refresh() }, 1500)
            })
        }
        if (event.type === "error") { es.close(); refresh() }
      } catch { /* skip */ }
    }
    es.onerror = () => es.close()
    return () => es.close()
  }, [processingId]) // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const docCreatedAt = useChatStore((s) => s.docCreatedAt)
  useEffect(() => {
    if (docCreatedAt > 0) refresh()
  }, [docCreatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/folders?parentId=${workspaceId}`).then((r) => r.json()),
      fetch(`/api/lectures?folderId=${workspaceId}`).then((r) => r.json()),
      fetch(`/api/documents?folderId=${workspaceId}`).then((r) => r.json()),
    ])
      .then(([f, l, d]) => {
        const flds: Folder[] = f.folders ?? []
        const lcts: Lecture[] = l.lectures ?? []
        const docs: Document[] = d.documents ?? []
        setFolders(flds)
        setLectures(lcts)
        setDocuments(docs)

        // Re-attach to any lecture still processing (e.g. after navigating away and back)
        const inProgress = lcts.find(
          (l) => l.processingStatus === "processing" || l.processingStatus === "pending"
        )
        if (inProgress) {
          setProcessingId((prev) => prev ?? inProgress.id)
        }

        // Build workspace overview context item
        const overview = [
          `Workspace: ${workspaceName}`,
          flds.length > 0 ? `Folders: ${flds.map((f) => f.name).join(", ")}` : null,
          lcts.length > 0 ? `Lectures: ${lcts.map((l) => l.title).join(", ")}` : null,
          docs.length > 0 ? `Documents: ${docs.map((d) => d.title || "Untitled").join(", ")}` : null,
        ].filter(Boolean).join("\n")

        setWorkspaceItems([
          {
            id: `workspace-${workspaceId}`,
            type: "workspace",
            label: workspaceName,
            content: overview,
          },
        ])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [workspaceId, workspaceName, refreshKey, setWorkspaceItems])

  async function handleNewDoc() {
    const res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: workspaceId }),
    })
    const data = await res.json()
    if (data.document?.id) {
      setPendingBreadcrumb(breadcrumb)
      router.push(`/document/${data.document.id}`)
    }
  }

  async function uploadFile(file: File) {
    if (!file || file.type !== "application/pdf") return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("folderId", workspaceId)
      const res = await fetch("/api/uploads", { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? "Upload failed"); return }
      refresh()
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    dragCounterRef.current += 1
    if (e.dataTransfer.types.includes("Files")) setIsDraggingOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    dragCounterRef.current -= 1
    if (dragCounterRef.current === 0) setIsDraggingOver(false)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    dragCounterRef.current = 0
    setIsDraggingOver(false)
    const file = Array.from(e.dataTransfer.files).find((f) => f.type === "application/pdf")
    if (file) uploadFile(file)
  }

  async function deleteFolder(id: string) {
    await fetch(`/api/folders/${id}`, { method: "DELETE" })
    setFolders((prev) => prev.filter((f) => f.id !== id))
  }

  async function renameFolder(id: string, name: string) {
    await fetch(`/api/folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)))
  }

  async function deleteLecture(id: string) {
    await fetch(`/api/lectures/${id}`, { method: "DELETE" })
    setLectures((prev) => prev.filter((l) => l.id !== id))
  }

  async function renameLecture(id: string, title: string) {
    setLectures((prev) => prev.map((l) => l.id === id ? { ...l, title } : l))
    await fetch(`/api/lectures/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
  }

  async function deleteDocument(id: string) {
    await fetch(`/api/documents/${id}`, { method: "DELETE" })
    setDocuments((prev) => prev.filter((d) => d.id !== id))
  }

  async function renameDocument(id: string, title: string) {
    setDocuments((prev) => prev.map((d) => d.id === id ? { ...d, title } : d))
    await fetch(`/api/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
  }

  async function changeLectureColor(id: string, hex: string) {
    setLectures((prev) => prev.map((l) => l.id === id ? { ...l, color: hex } : l))
    await fetch(`/api/lectures/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color: hex }),
    })
  }

  async function changeDocColor(id: string, hex: string) {
    setDocuments((prev) => prev.map((d) => d.id === id ? { ...d, color: hex } : d))
    await fetch(`/api/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color: hex }),
    })
  }

  const isEmpty = !loading && folders.length === 0 && lectures.length === 0 && documents.length === 0

  // Breadcrumb: all items except the last (which is current — shown bold)
  const breadcrumbParents = breadcrumb.slice(0, -1)
  const currentCrumb = breadcrumb[breadcrumb.length - 1]

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-sidebar shrink-0 h-11">
        {/* Left: back + breadcrumb */}
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          <button
            onClick={() => router.push("/")}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Marrow</span>
          </button>

          {/* Ancestor breadcrumb */}
          {breadcrumbParents.map((item) => (
            <span key={item.id} className="flex items-center gap-1 shrink-0">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
              <button
                onClick={() => router.push(`/workspace/${item.id}`)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {item.name}
              </button>
            </span>
          ))}

          {/* Current folder */}
          {currentCrumb && (
            <span className="flex items-center gap-1 min-w-0 overflow-hidden">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
              <FolderIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground font-medium truncate">{currentCrumb.name}</span>
            </span>
          )}
        </div>

        {/* Right: toolbar */}
        <div className="flex items-center gap-1.5 shrink-0">
          {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 transition-colors">
              <Plus className="h-3.5 w-3.5" />
              New
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={handleNewDoc}>
                <FileText className="h-4 w-4 mr-2" /> Document
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCreateFolderOpen(true)}>
                <FolderIcon className="h-4 w-4 mr-2" /> Folder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> Upload PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAddLectureOpen(true)}>
                <PlayCircle className="h-4 w-4 mr-2" /> YouTube
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleUpload}
      />

      {/* Content area */}
      <div className="flex-1 overflow-hidden min-h-0">

        {/* Content grid */}
        <div
          className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden relative h-full"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* PDF drag-and-drop overlay */}
          {isDraggingOver && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 pointer-events-none"
              style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}>
              <div className="rounded-2xl border-2 border-dashed border-foreground/40 px-12 py-8 flex flex-col items-center gap-3">
                <Upload className="h-10 w-10 text-foreground/60" strokeWidth={1.5} />
                <p className="text-sm font-medium text-foreground/80">Drop PDF to upload</p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-5 p-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-[4/3] rounded-md bg-card/40 animate-pulse" />
              ))}
            </div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full gap-5 text-center p-8">
              <div className="rounded-full bg-muted p-5">
                <FolderIcon className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-lg">This workspace is empty</p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Add a YouTube lecture, upload a PDF, create a document, or add a folder.
                </p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                <button onClick={() => setAddLectureOpen(true)} className="rounded-md border bg-card px-4 py-2 text-sm font-medium hover:bg-accent hover:border-foreground/30 transition-all duration-200">
                  + YouTube
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="rounded-md border bg-card px-4 py-2 text-sm font-medium hover:bg-accent hover:border-foreground/30 transition-all duration-200">
                  + PDF
                </button>
                <button onClick={handleNewDoc} className="rounded-md border bg-card px-4 py-2 text-sm font-medium hover:bg-accent hover:border-foreground/30 transition-all duration-200">
                  + Document
                </button>
                <button onClick={() => setCreateFolderOpen(true)} className="rounded-md border bg-card px-4 py-2 text-sm font-medium hover:bg-accent hover:border-foreground/30 transition-all duration-200">
                  + Folder
                </button>
              </div>
            </div>
          ) : (
            <div
              className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-5 p-6"
              onContextMenu={(e) => {
                // Only trigger on the grid background, not on cards
                if ((e.target as HTMLElement).closest(".group\\/card")) return
                e.preventDefault()
                setContextMenu({ x: e.clientX, y: e.clientY })
              }}
              onClick={() => setContextMenu(null)}
            >
              {folders.map((f) => (
                <div key={f.id} className="relative group/card">
                  <FolderCard
                    folder={f}
                    onOpen={() => !selectionActive && router.push(`/workspace/${f.id}`)}
                    onDelete={() => deleteFolder(f.id)}
                    onRename={(name) => renameFolder(f.id, name)}
                    onMove={() => setMoveTarget({ id: f.id, type: "folder", label: f.name })}
                  />
                  <SelectBox id={f.id} type="folder" selected={selected} selectionActive={selectionActive} onToggle={toggleSelect} positionCls="top-[12%] right-10" />
                </div>
              ))}
              {lectures.filter((l) => l.id !== processingId).map((l) => (
                <div key={l.id} className="relative group/card">
                  <LectureCard
                    lecture={l}
                    onDelete={() => deleteLecture(l.id)}
                    onMove={() => setMoveTarget({ id: l.id, type: "lecture", label: l.title })}
                    onColorChange={(hex) => changeLectureColor(l.id, hex)}
                    onRename={(title) => renameLecture(l.id, title)}
                    navBreadcrumb={breadcrumb}
                  />
                  <SelectBox id={l.id} type="lecture" selected={selected} selectionActive={selectionActive} onToggle={toggleSelect} positionCls="top-2 right-10" />
                </div>
              ))}

              {/* In-grid processing card */}
              {processingId && (
                <ProcessingCard
                  lectureId={processingId}
                  events={processingEvents}
                  onOpen={() => router.push(`/lecture/${processingId}`)}
                />
              )}
              {documents.map((d) => (
                <div key={d.id} className="relative group/card">
                  <DocumentCard
                    doc={d}
                    onDelete={() => deleteDocument(d.id)}
                    onMove={() => setMoveTarget({ id: d.id, type: "document", label: d.title || "Untitled" })}
                    onColorChange={(hex) => changeDocColor(d.id, hex)}
                    onRename={(title) => renameDocument(d.id, title)}
                    navBreadcrumb={breadcrumb}
                  />
                  <SelectBox id={d.id} type="document" selected={selected} selectionActive={selectionActive} onToggle={toggleSelect} positionCls="top-2 right-10" />
                </div>
              ))}

              {/* Add card — dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger className="group flex flex-col items-center justify-center gap-2.5 aspect-[4/3] rounded-md border border-dashed border-foreground/15 hover:border-foreground/30 hover:bg-card/50 transition-all duration-200 w-full">
                  <Plus className="h-6 w-6 text-foreground/25 group-hover:text-foreground/50 transition-colors" strokeWidth={1.5} />
                  <span className="text-xs text-muted-foreground group-hover:text-foreground/70 transition-colors">Add content</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-44">
                  <DropdownMenuItem onClick={handleNewDoc}>
                    <FileText className="h-4 w-4 mr-2" /> Document
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCreateFolderOpen(true)}>
                    <FolderIcon className="h-4 w-4 mr-2" /> Folder
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" /> Upload PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setAddLectureOpen(true)}>
                    <PlayCircle className="h-4 w-4 mr-2" /> YouTube
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      {/* Selection bottom action bar */}
      <AnimatePresence>
        {selectionActive && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-card border border-border rounded-xl px-4 py-2.5 shadow-2xl"
          >
            <span className="text-sm font-medium text-foreground mr-2">
              {selected.size} item{selected.size !== 1 ? "s" : ""} selected
            </span>
            <div className="w-px h-4 bg-border mx-1" />
            <button
              onClick={() => setMoveOpen(true)}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <MoveRight className="h-3.5 w-3.5" /> Move
            </button>
            <button
              onClick={deleteSelected}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
            <div className="w-px h-4 bg-border mx-1" />
            <button
              onClick={clearSelection}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Move dialog — shared for multi-select and single-item */}
      {(moveOpen || moveTarget) && (
        <MoveDialog
          title={moveTarget ? `Move "${moveTarget.label}"` : `Move ${selected.size} item${selected.size !== 1 ? "s" : ""}`}
          folders={allFolders as { id: string; name: string; parentId: string | null }[]}
          currentFolderId={workspaceId}
          search={moveSearch}
          onSearch={setMoveSearch}
          onMove={(targetId) => {
            if (moveTarget) {
              moveSingleItem(targetId)
            } else {
              moveSelected(targetId)
              setMoveOpen(false)
            }
          }}
          onClose={() => { setMoveOpen(false); setMoveTarget(null); setMoveSearch("") }}
        />
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null) }} />
          <div
            className="fixed z-50 bg-popover border border-border rounded-lg shadow-xl py-1 w-44 text-sm"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button onClick={() => { setContextMenu(null); handleNewDoc() }} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent transition-colors text-left">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" /> Document
            </button>
            <button onClick={() => { setContextMenu(null); setCreateFolderOpen(true) }} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent transition-colors text-left">
              <FolderIcon className="h-3.5 w-3.5 text-muted-foreground" /> Folder
            </button>
            <button onClick={() => { setContextMenu(null); fileInputRef.current?.click() }} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent transition-colors text-left">
              <Upload className="h-3.5 w-3.5 text-muted-foreground" /> Upload PDF
            </button>
            <button onClick={() => { setContextMenu(null); setAddLectureOpen(true) }} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent transition-colors text-left">
              <PlayCircle className="h-3.5 w-3.5 text-muted-foreground" /> YouTube lecture
            </button>
          </div>
        </>
      )}

      {/* Dialogs */}
      <CreateWorkspaceDialog
        open={createFolderOpen}
        onClose={() => setCreateFolderOpen(false)}
        onCreated={() => { refresh(); setCreateFolderOpen(false) }}
        parentId={workspaceId}
        title="Create New Folder"
      />
      <AddLectureDialog
        open={addLectureOpen}
        onClose={() => setAddLectureOpen(false)}
        folderId={workspaceId}
        onStarted={(id) => { setProcessingId(id); setProcessingEvents([]) }}
      />
    </div>
  )
}

// In-grid card shown while a lecture is being processed
const PROC_STEPS: { event: ProcessingEvent["type"]; label: string }[] = [
  { event: "content_start", label: "Transcript" },
  { event: "outline_done", label: "Outline" },
  { event: "flashcards_done", label: "Cards" },
  { event: "summary_90s_done", label: "Summary" },
  { event: "embed_done", label: "Search" },
]

function ProcessingCard({
  lectureId,
  events,
  onOpen,
}: {
  lectureId: string
  events: ProcessingEvent[]
  onOpen: () => void
}) {
  const [lecture, setLecture] = useState<Lecture | null>(null)
  const done = new Set(events.map((e) => e.type))
  const isComplete = done.has("completed")

  useEffect(() => {
    fetch(`/api/lectures/${lectureId}`).then((r) => r.json()).then(setLecture).catch(() => {})
  }, [lectureId])

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={isComplete ? onOpen : undefined}
      className={`group relative rounded-md border border-border bg-card aspect-[4/3] flex flex-col overflow-hidden shadow-sm transition-all duration-200 ${isComplete ? "cursor-pointer hover:border-foreground/30 hover:shadow-md" : "cursor-default"}`}
    >
      {/* Thumbnail area */}
      <div className="relative overflow-hidden border-b border-border" style={{ flex: "0 0 58%" }}>
        {lecture?.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={lecture.thumbnailUrl} alt="" className="w-full h-full object-cover opacity-40" />
        ) : (
          <div className="w-full h-full bg-muted/30" />
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          {isComplete ? (
            <CheckCircle2 className="h-6 w-6 text-emerald-400" />
          ) : (
            <Loader2 className="h-5 w-5 text-white/60 animate-spin" />
          )}
          <span className="text-[10px] text-white/60 font-medium">
            {isComplete ? "Ready" : "Processing…"}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-col justify-center px-3 py-2 gap-1.5" style={{ flex: "1 1 0" }}>
        <p className="text-xs font-medium text-foreground truncate">
          {lecture?.title ?? "Processing lecture…"}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {PROC_STEPS.map(({ event, label }) => (
            <span
              key={event}
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                done.has(event) || isComplete
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-muted text-muted-foreground/40"
              }`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

// ThinkEx-style move dialog with hierarchical folder tree
function MoveDialog({
  title,
  folders,
  currentFolderId,
  search,
  onSearch,
  onMove,
  onClose,
}: {
  title: string
  folders: { id: string; name: string; parentId: string | null }[]
  currentFolderId: string
  search: string
  onSearch: (s: string) => void
  onMove: (targetId: string) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)

  // Build display list: roots first, then children indented
  type FolderEntry = { id: string; name: string; depth: number }
  function buildList(parentId: string | null, depth: number): FolderEntry[] {
    return folders
      .filter((f) => f.parentId === parentId && f.id !== currentFolderId)
      .flatMap((f) => [{ id: f.id, name: f.name, depth }, ...buildList(f.id, depth + 1)])
  }
  const list = buildList(null, 0)
  const filtered = search.trim()
    ? list.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : list

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-background border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5">
        <h3 className="text-sm font-semibold mb-0.5">Move item</h3>
        <p className="text-xs text-muted-foreground mb-3">Select a destination folder.</p>

        {/* Search */}
        <div className="relative mb-2">
          <input
            autoFocus
            placeholder="Search folders…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-foreground/30"
          />
        </div>

        {/* Folder list */}
        <div className="space-y-0.5 max-h-56 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-4 text-center">No folders found.</p>
          )}
          {filtered.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelected(f.id)}
              className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors ${
                selected === f.id ? "bg-primary/10 text-foreground" : "hover:bg-accent text-foreground"
              }`}
              style={{ paddingLeft: 12 + f.depth * 16 }}
            >
              <FolderIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{f.name}</span>
              {selected === f.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-1.5 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            Cancel
          </button>
          <button
            disabled={!selected}
            onClick={() => selected && onMove(selected)}
            className="px-4 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            Move
          </button>
        </div>
      </div>
    </div>
  )
}

// Checkbox overlay rendered on top of each card
function SelectBox({
  id, type, selected, selectionActive, onToggle, positionCls = "top-2 right-10",
}: {
  id: string
  type: "folder" | "lecture" | "document"
  selected: Map<string, "folder" | "lecture" | "document">
  selectionActive: boolean
  onToggle: (id: string, type: "folder" | "lecture" | "document", e: React.MouseEvent) => void
  positionCls?: string
}) {
  const isSelected = selected.has(id)
  return (
    <button
      onClick={(e) => onToggle(id, type, e)}
      className={`absolute z-20 flex h-5 w-5 items-center justify-center rounded border transition-all duration-150 ${positionCls}
        ${isSelected
          ? "bg-primary border-primary opacity-100"
          : selectionActive
            ? "bg-card/80 border-border opacity-100"
            : "bg-card/80 border-border opacity-0 group-hover/card:opacity-100"
        }`}
    >
      {isSelected && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={2.5} />}
    </button>
  )
}
