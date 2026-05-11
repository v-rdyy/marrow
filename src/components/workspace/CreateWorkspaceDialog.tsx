"use client"

import { useState } from "react"
import { Folder, BookOpen, Layers, Box, Briefcase, Code2, X } from "lucide-react"
import { CARD_COLORS, type CardColor, type Folder as FolderType } from "@/types"

const ICONS = [
  { key: "folder",    Icon: Folder,    label: "Folder" },
  { key: "book",      Icon: BookOpen,  label: "Book" },
  { key: "layers",    Icon: Layers,    label: "Layers" },
  { key: "box",       Icon: Box,       label: "Box" },
  { key: "briefcase", Icon: Briefcase, label: "Briefcase" },
  { key: "code",      Icon: Code2,     label: "Code" },
]

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (folder: FolderType) => void
  parentId: string | null
  title?: string
}

export function CreateWorkspaceDialog({ open, onClose, onCreated, parentId, title = "Create New Workspace" }: Props) {
  const [name, setName] = useState("")
  const [selectedColor, setSelectedColor] = useState<CardColor>("default")
  const [selectedIcon, setSelectedIcon] = useState("folder")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  if (!open) return null

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError("Name is required"); return }
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), color: selectedColor, parentId }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Something went wrong"); return }
      onCreated(data.folder)
      setName("")
      setSelectedColor("default")
      setSelectedIcon("folder")
      onClose()
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  const subtitle = parentId
    ? "Create a folder to organize content inside this workspace."
    : "Set up a new workspace to organize your projects, documents, and ideas."
  const buttonLabel = parentId ? "Create Folder" : "Create Workspace"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative z-10 bg-background border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground mt-1 mb-5">{subtitle}</p>

        <form onSubmit={handleCreate} className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs font-medium text-foreground">
              Name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              placeholder={parentId ? "My Folder" : "My Workspace"}
              value={name}
              onChange={(e) => { setName(e.target.value); setError("") }}
              autoFocus
              className="mt-1.5 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-foreground/40 transition-colors"
            />
            {error && <p className="text-xs text-destructive mt-1">{error}</p>}
          </div>

          {/* Icon selector */}
          <div>
            <label className="text-xs font-medium text-foreground">Icon</label>
            <div className="mt-1.5 flex gap-1.5">
              {ICONS.map(({ key, Icon, label }) => (
                <button
                  key={key}
                  type="button"
                  title={label}
                  onClick={() => setSelectedIcon(key)}
                  className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
                    selectedIcon === key
                      ? "border-foreground/60 bg-accent text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          {/* Color selector */}
          <div>
            <label className="text-xs font-medium text-foreground">Color</label>
            <div className="mt-1.5 flex gap-1.5">
              {CARD_COLORS.map(({ key, label, swatch }) => (
                <button
                  key={key}
                  type="button"
                  title={label}
                  onClick={() => setSelectedColor(key)}
                  className={`flex h-7 w-7 rounded-full transition-all ${swatch} ${
                    selectedColor === key
                      ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                      : "opacity-70 hover:opacity-100"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Creating…" : buttonLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
