import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ChatMessage } from "@/types"

interface ChatStore {
  messages: ChatMessage[]
  createdDocs: Record<string, { id: string; title: string }>
  addMessage: (msg: ChatMessage) => void
  updateMessage: (id: string, update: Partial<ChatMessage>) => void
  truncateTo: (messageId: string) => void
  setCreatedDoc: (msgId: string, doc: { id: string; title: string }) => void
  clear: () => void
  docCreatedAt: number
  notifyDocumentCreated: () => void
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      messages: [],
      createdDocs: {},
      addMessage: (msg) =>
        set((s) => ({ messages: [...s.messages, msg].slice(-120) })),
      updateMessage: (id, update) =>
        set((s) => ({
          messages: s.messages.map((m) => (m.id === id ? { ...m, ...update } : m)),
        })),
      truncateTo: (id) =>
        set((s) => {
          const idx = s.messages.findIndex((m) => m.id === id)
          if (idx === -1) return s
          const removed = s.messages.slice(idx).map((m) => m.id)
          const createdDocs = { ...s.createdDocs }
          removed.forEach((rid) => delete createdDocs[rid])
          return { messages: s.messages.slice(0, idx), createdDocs }
        }),
      setCreatedDoc: (msgId, doc) =>
        set((s) => ({ createdDocs: { ...s.createdDocs, [msgId]: doc } })),
      clear: () => set({ messages: [], createdDocs: {} }),
      docCreatedAt: 0,
      notifyDocumentCreated: () => set({ docCreatedAt: Date.now() }),
    }),
    { name: "marrow-chat" }
  )
)
