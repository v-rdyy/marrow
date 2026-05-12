"use client"

import { motion } from "framer-motion"
import { Folder, MoreHorizontal, Trash2, Pencil, MoveRight } from "lucide-react"
import { useState, useRef } from "react"
import type { Folder as FolderType } from "@/types"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface Props {
  folder: FolderType
  onOpen: () => void
  onDelete: () => void
  onRename: (name: string) => void
  onMove?: () => void
}

export function FolderCard({ folder, onOpen, onDelete, onRename, onMove }: Props) {
  const [renaming, setRenaming] = useState(false)
  const [nameValue, setNameValue] = useState(folder.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const count = (folder.lectureCount ?? 0) + (folder.documentCount ?? 0)

  function startRename() {
    setRenaming(true)
    setNameValue(folder.name)
    setTimeout(() => inputRef.current?.select(), 50)
  }

  function commitRename() {
    setRenaming(false)
    if (nameValue.trim() && nameValue.trim() !== folder.name) onRename(nameValue.trim())
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      whileHover={{ scale: 1.015 }}
      className="group relative aspect-[4/3] cursor-pointer"
      onClick={renaming ? undefined : onOpen}
    >
      {/* Tab piece — ThinkEx signature */}
      <div className="absolute left-0 top-0 h-[10%] w-[35%] rounded-t-md border border-b-0 border-border bg-card" />

      {/* Body piece */}
      <div className="absolute bottom-0 left-0 right-0 top-[10%] rounded-md rounded-tl-none overflow-hidden border border-border bg-card shadow-sm transition-all duration-200 group-hover:shadow-md group-hover:border-foreground/25">
        <div className="flex flex-col h-full p-3">
          {/* Icon */}
          <div className="flex-1 flex items-start pt-1">
            <Folder
              className="h-8 w-8 text-foreground/35 group-hover:text-foreground/55 transition-colors"
              strokeWidth={1}
            />
          </div>

          {/* Name + count */}
          <div>
            {renaming ? (
              <input
                ref={inputRef}
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename()
                  if (e.key === "Escape") setRenaming(false)
                }}
                className="text-sm font-medium bg-transparent border-b border-foreground/30 outline-none w-full text-foreground"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <p className="text-sm font-medium text-foreground truncate">{folder.name}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              {count > 0 ? `${count} item${count !== 1 ? "s" : ""}` : "Empty"}
            </p>
          </div>
        </div>
      </div>

      {/* Kebab */}
      <div
        className="absolute top-[12%] right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-md p-1.5 bg-background/60 hover:bg-background/90 transition-colors">
            <MoreHorizontal className="h-3.5 w-3.5 text-foreground/70" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={startRename}>
              <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
            </DropdownMenuItem>
            {onMove && (
              <DropdownMenuItem onClick={onMove}>
                <MoveRight className="h-3.5 w-3.5 mr-2" /> Move
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  )
}
