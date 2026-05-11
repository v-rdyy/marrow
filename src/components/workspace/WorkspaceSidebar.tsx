"use client"

import { BookOpen, Folder, Home, PanelLeftClose, PanelLeft } from "lucide-react"
import { useUIStore } from "@/stores/ui-store"
import type { Folder as FolderType } from "@/types"

interface Props {
  folders: FolderType[]
  onFolderCreated?: () => void
}

export function WorkspaceSidebar({ folders }: Props) {
  const { activeFolderId, setActiveFolderId, sidebarOpen, toggleSidebar } = useUIStore()
  const collapsed = !sidebarOpen

  return (
    <aside
      className={`flex flex-col h-full border-r border-sidebar-border bg-sidebar transition-all duration-200 shrink-0 overflow-hidden ${
        collapsed ? "w-12" : "w-64"
      }`}
    >
      {/* Logo */}
      <div className={`flex items-center gap-2.5 px-3 py-4 shrink-0 ${collapsed ? "justify-center" : ""}`}>
        <BookOpen className="h-4 w-4 text-foreground shrink-0" />
        {!collapsed && <span className="font-semibold text-sm tracking-tight">Marrow</span>}
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-0.5 px-2 flex-1 overflow-y-auto min-h-0">
        <button
          onClick={() => setActiveFolderId(null)}
          title="All items"
          className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm w-full transition-colors ${
            collapsed ? "justify-center" : ""
          } ${
            activeFolderId === null
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
          }`}
        >
          <Home className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="truncate">All items</span>}
        </button>

        {folders.length > 0 && (
          <>
            {!collapsed && (
              <p className="px-2 pt-4 pb-1 text-xs text-muted-foreground/60 uppercase tracking-wider font-medium">
                Folders
              </p>
            )}
            {collapsed && <div className="my-2 border-t border-border/40" />}
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => setActiveFolderId(folder.id)}
                title={folder.name}
                className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm w-full transition-colors ${
                  collapsed ? "justify-center" : ""
                } ${
                  activeFolderId === folder.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                }`}
              >
                <Folder className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate text-left">{folder.name}</span>
                    {((folder.lectureCount ?? 0) + (folder.documentCount ?? 0)) > 0 && (
                      <span className="text-xs text-muted-foreground/50 shrink-0">
                        {(folder.lectureCount ?? 0) + (folder.documentCount ?? 0)}
                      </span>
                    )}
                  </>
                )}
              </button>
            ))}
          </>
        )}
      </nav>

      {/* Collapse toggle */}
      <div className="px-2 pb-3 shrink-0">
        <button
          onClick={toggleSidebar}
          title={collapsed ? "Expand" : "Collapse"}
          className="flex items-center justify-center w-full rounded-md p-2 text-muted-foreground/50 hover:bg-sidebar-accent/60 hover:text-foreground transition-colors"
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  )
}
