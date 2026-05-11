"use client"

import { X, FileText, Folder, PlayCircle, Type, Image, BookOpen } from "lucide-react"
import type { ContextItem, ContextItemType } from "@/types"

interface Props {
  items: ContextItem[]
  onRemove: (id: string) => void
}

function ItemIcon({ type, isPriority }: { type: ContextItemType; isPriority?: boolean }) {
  const cls = `h-3 w-3 shrink-0 ${isPriority ? "text-primary" : "text-muted-foreground"}`
  switch (type) {
    case "document": return <FileText className={cls} />
    case "folder": return <Folder className={cls} />
    case "lecture": return <PlayCircle className={cls} />
    case "text-selection": return <Type className={cls} />
    case "image": return <Image className={cls} />
    case "workspace": return <BookOpen className={cls} />
    default: return <FileText className={cls} />
  }
}

export function ContextChips({ items, onRemove }: Props) {
  if (items.length === 0) return null

  // Show workspace item minimized, individual items as chips
  const workspaceItem = items.find((i) => i.type === "workspace")
  const chipItems = items.filter((i) => i.type !== "workspace")

  return (
    <div className="px-3 pt-2 pb-1 flex flex-wrap gap-1.5">
      {workspaceItem && chipItems.length === 0 && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground/60 px-1">
          <BookOpen className="h-3 w-3" />
          Workspace in context
        </span>
      )}
      {chipItems.map((item) => (
        <div
          key={item.id}
          className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs max-w-[160px] group
            ${item.isPriority
              ? "bg-primary/15 border border-primary/30 text-primary"
              : "bg-accent border border-border text-muted-foreground"
            }`}
        >
          <ItemIcon type={item.type} isPriority={item.isPriority} />
          <span className="truncate">{item.label}</span>
          <button
            onClick={() => onRemove(item.id)}
            className="ml-0.5 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
