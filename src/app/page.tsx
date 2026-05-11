"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { BookOpen, Plus, Search, Folder, MoreHorizontal, Trash2 } from "lucide-react"
import { CreateWorkspaceDialog } from "@/components/workspace/CreateWorkspaceDialog"
import type { Folder as FolderType } from "@/types"

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function HomePage() {
  const [workspaces, setWorkspaces] = useState<FolderType[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const router = useRouter()

  const deleteWorkspace = useCallback(async (id: string) => {
    setMenuOpenId(null)
    setWorkspaces((ws) => ws.filter((w) => w.id !== id))
    await fetch(`/api/folders/${id}`, { method: "DELETE" }).catch(() => {})
  }, [])

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  useEffect(() => {
    fetch("/api/folders?parentId=null")
      .then((r) => r.json())
      .then((d) => setWorkspaces(d.folders ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [refreshKey])

  const filtered = workspaces.filter((w) =>
    w.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-sidebar-border bg-sidebar shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-foreground/15">
            <BookOpen className="h-3.5 w-3.5 text-foreground/80" />
          </div>
          <span className="text-sm font-semibold">Marrow</span>
        </div>

        {/* Search */}
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search workspaces..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-sidebar-border bg-sidebar-accent/40 pl-8 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground/30 transition-colors"
          />
        </div>

        <div className="w-28" />
      </header>

      {/* Main content */}
      <main className="flex-1 px-10 py-10">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-6">
          Recent workspaces
        </h2>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-5 max-w-5xl">
          {/* New workspace card */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.12 }}
            onClick={() => setCreateOpen(true)}
            className="group flex flex-col items-center justify-center gap-3 aspect-[4/3] rounded-lg border-2 border-dashed border-border hover:border-foreground/30 hover:bg-card/60 transition-all duration-200 cursor-pointer"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border-2 border-dashed border-border group-hover:border-foreground/30 transition-colors bg-card/40">
              <Plus className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" strokeWidth={2} />
            </div>
            <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
              New workspace
            </span>
          </motion.button>

          {/* Workspace cards */}
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="aspect-[4/3] rounded-lg bg-card animate-pulse" />
              ))
            : filtered.map((ws, i) => (
                <motion.div
                  key={ws.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, delay: i * 0.04 }}
                  whileHover={{ scale: 1.02 }}
                  className="group relative flex flex-col items-center justify-center gap-3 aspect-[4/3] rounded-lg bg-card border border-border hover:border-foreground/25 hover:bg-card/80 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer"
                  onClick={() => router.push(`/workspace/${ws.id}`)}
                >
                  <Folder
                    className="h-16 w-16 text-foreground/40 group-hover:text-foreground/60 transition-colors"
                    strokeWidth={0.75}
                  />
                  <div className="text-center px-3 w-full">
                    <p className="text-sm font-semibold text-foreground truncate">{ws.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatDate(ws.createdAt)}</p>
                  </div>

                  {/* 3-dot menu */}
                  <button
                    className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-foreground/10 transition-all"
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenuOpenId(menuOpenId === ws.id ? null : ws.id)
                    }}
                  >
                    <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                  </button>

                  {menuOpenId === ws.id && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={(e) => { e.stopPropagation(); setMenuOpenId(null) }}
                      />
                      <div
                        className="absolute top-8 right-2 z-20 min-w-[130px] rounded-md border border-border bg-popover shadow-lg py-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                          onClick={() => deleteWorkspace(ws.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete workspace
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              ))}
        </div>

        {!loading && filtered.length === 0 && search && (
          <p className="text-sm text-muted-foreground mt-8">
            No workspaces matching &ldquo;{search}&rdquo;
          </p>
        )}
      </main>

      <CreateWorkspaceDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(ws) => {
          refresh()
          router.push(`/workspace/${ws.id}`)
        }}
        parentId={null}
      />
    </div>
  )
}
