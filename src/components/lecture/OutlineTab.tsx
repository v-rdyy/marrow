"use client"

import { useState } from "react"
import { ChevronRight } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { ClaimSource } from "./ClaimSource"
import type { OutlineNode } from "@/types"

interface Props {
  outline: OutlineNode[]
}

export function OutlineTab({ outline }: Props) {
  if (outline.length === 0) {
    return <p className="text-sm text-muted-foreground p-4">No outline available.</p>
  }

  return (
    <div className="space-y-0.5 p-2">
      {outline.map((node, i) => (
        <OutlineNodeItem key={i} node={node} depth={0} />
      ))}
    </div>
  )
}

function OutlineNodeItem({ node, depth }: { node: OutlineNode; depth: number }) {
  const [open, setOpen] = useState(depth === 0)
  const hasChildren = node.children && node.children.length > 0

  return (
    <div>
      <div
        className="flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-accent cursor-pointer group"
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => hasChildren && setOpen((o) => !o)}
      >
        {hasChildren ? (
          <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </motion.div>
        ) : (
          <div className="w-3.5" />
        )}
        <span className="text-sm flex-1 leading-snug">{node.title}</span>
        <ClaimSource timestamp={node.timestamp} />
      </div>

      <AnimatePresence>
        {open && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {node.children.map((child, i) => (
              <OutlineNodeItem key={i} node={child} depth={depth + 1} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
