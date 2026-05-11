"use client"

import { useEffect, useState, useCallback } from "react"
import { Plus, BookOpen } from "lucide-react"
import { motion } from "framer-motion"
import { Skeleton } from "@/components/ui/skeleton"
import { FolderCard } from "./FolderCard"
import { LectureCard } from "./LectureCard"
import { DocumentCard } from "./DocumentCard"
import { useUIStore } from "@/stores/ui-store"
import type { Folder, Lecture, Document } from "@/types"

interface Props {
  onAddLecture: () => void
  onAddFolder: () => void
  onAddDocument: () => void
  refreshKey: number
}

export function WorkspaceGrid({ onAddLecture, onAddFolder, onAddDocument, refreshKey }: Props) {
  const { activeFolderId, setActiveFolderId } = useUIStore()
  const [folders, setFolders] = useState<Folder[]>([])
  const [lectures, setLectures] = useState<Lecture[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [foldersRes, lecturesRes, docsRes] = await Promise.all([
        // folders only at root
        activeFolderId === null ? fetch("/api/folders") : Promise.resolve(null),
        fetch(activeFolderId === null ? "/api/lectures?folderId=null" : `/api/lectures?folderId=${activeFolderId}`),
        fetch(activeFolderId === null ? "/api/documents?folderId=null" : `/api/documents?folderId=${activeFolderId}`),
      ])

      if (foldersRes) {
        const f = await foldersRes.json()
        setFolders(f.folders ?? [])
      } else {
        setFolders([])
      }

      const l = await lecturesRes.json()
      setLectures(l.lectures ?? [])

      const d = await docsRes.json()
      setDocuments(d.documents ?? [])
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [activeFolderId])

  useEffect(() => { load() }, [load, refreshKey])

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
    setFolders((prev) => prev.map((f) => f.id === id ? { ...f, name } : f))
  }

  async function deleteLecture(id: string) {
    await fetch(`/api/lectures/${id}`, { method: "DELETE" })
    setLectures((prev) => prev.filter((l) => l.id !== id))
  }

  async function deleteDocument(id: string) {
    await fetch(`/api/documents/${id}`, { method: "DELETE" })
    setDocuments((prev) => prev.filter((d) => d.id !== id))
  }

  const isEmpty = !loading && folders.length === 0 && lectures.length === 0 && documents.length === 0

  if (loading) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-6 px-4 py-6 sm:px-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/3] rounded-md" />
        ))}
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-5 text-center p-8">
        <div className="rounded-full bg-muted p-5">
          <BookOpen className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="font-medium text-lg">
            {activeFolderId ? "This folder is empty" : "No content yet"}
          </p>
          <p className="text-sm text-muted-foreground max-w-xs">
            {activeFolderId
              ? "Add a lecture or create a note inside this folder."
              : "Add a YouTube lecture, create a folder to organize, or start a new note."}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onAddLecture}
            className="rounded-md border bg-card px-4 py-2 text-sm font-medium hover:bg-accent hover:border-foreground/30 transition-all duration-200"
          >
            + Lecture
          </button>
          {activeFolderId === null && (
            <button
              onClick={onAddFolder}
              className="rounded-md border bg-card px-4 py-2 text-sm font-medium hover:bg-accent hover:border-foreground/30 transition-all duration-200"
            >
              + Folder
            </button>
          )}
          <button
            onClick={onAddDocument}
            className="rounded-md border bg-card px-4 py-2 text-sm font-medium hover:bg-accent hover:border-foreground/30 transition-all duration-200"
          >
            + Note
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-6 overflow-y-auto flex-1 min-h-0">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-6">
        {/* Folders first (only at root) */}
        {folders.map((folder) => (
          <FolderCard
            key={folder.id}
            folder={folder}
            onOpen={() => setActiveFolderId(folder.id)}
            onDelete={() => deleteFolder(folder.id)}
            onRename={(name) => renameFolder(folder.id, name)}
          />
        ))}

        {/* Lectures */}
        {lectures.map((lecture) => (
          <LectureCard
            key={lecture.id}
            lecture={lecture}
            onDelete={() => deleteLecture(lecture.id)}
          />
        ))}

        {/* Documents */}
        {documents.map((doc) => (
          <DocumentCard
            key={doc.id}
            doc={doc}
            onDelete={() => deleteDocument(doc.id)}
          />
        ))}

        {/* Add lecture card — ThinkEx "New workspace" style: dashed border + centered + icon */}
        <motion.button
          whileHover={{ scale: 1.015 }}
          transition={{ duration: 0.15 }}
          onClick={onAddLecture}
          className="group flex flex-col items-center justify-center gap-2.5 aspect-[4/3] rounded-md border border-dashed border-foreground/15 hover:border-foreground/30 hover:bg-card/50 transition-all duration-200"
        >
          <Plus className="h-7 w-7 text-foreground/25 group-hover:text-foreground/50 transition-colors" strokeWidth={1.5} />
          <span className="text-xs text-muted-foreground group-hover:text-foreground/70 transition-colors">New lecture</span>
        </motion.button>
      </div>
    </div>
  )
}
