import { create } from "zustand"
import type { ContextItem } from "@/types"

interface ContextState {
  items: ContextItem[]
  add: (item: ContextItem) => void
  remove: (id: string) => void
  clear: () => void
  setWorkspaceItems: (items: ContextItem[]) => void
  lectureContext: { id: string; title: string } | null
  setLectureContext: (ctx: { id: string; title: string } | null) => void
}

export const useContextStore = create<ContextState>((set) => ({
  items: [],

  add: (item) =>
    set((s) => {
      const idx = s.items.findIndex((c) => c.id === item.id)
      if (idx === -1) return { items: [...s.items, item] }
      const next = [...s.items]
      next[idx] = item
      return { items: next }
    }),

  remove: (id) =>
    set((s) => ({ items: s.items.filter((c) => c.id !== id) })),

  clear: () => set({ items: [] }),

  // Replace all non-priority items with a fresh workspace snapshot
  setWorkspaceItems: (items) =>
    set((s) => ({
      items: [...s.items.filter((c) => c.isPriority), ...items],
    })),

  lectureContext: null,
  setLectureContext: (ctx) => set({ lectureContext: ctx }),
}))
