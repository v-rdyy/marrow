import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ChatMessage } from "@/types"

interface ChatStore {
  currentScope: string
  setScope: (scope: string) => void
  allMessages: Record<string, ChatMessage[]>
  allDocs: Record<string, Record<string, { id: string; title: string }>>
  docCreatedAt: number

  // All operations below are scoped to currentScope
  addMessage: (msg: ChatMessage) => void
  updateMessage: (id: string, update: Partial<ChatMessage>) => void
  truncateTo: (messageId: string) => void
  setCreatedDoc: (msgId: string, doc: { id: string; title: string }) => void
  clear: () => void
  notifyDocumentCreated: () => void
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      currentScope: "global",
      setScope: (scope) => set({ currentScope: scope }),

      allMessages: {},
      allDocs: {},
      docCreatedAt: 0,

      addMessage: (msg) =>
        set((s) => {
          const prev = s.allMessages[s.currentScope] ?? []
          return {
            allMessages: {
              ...s.allMessages,
              [s.currentScope]: [...prev, msg].slice(-120),
            },
          }
        }),

      updateMessage: (id, update) =>
        set((s) => {
          const msgs = s.allMessages[s.currentScope] ?? []
          return {
            allMessages: {
              ...s.allMessages,
              [s.currentScope]: msgs.map((m) => (m.id === id ? { ...m, ...update } : m)),
            },
          }
        }),

      truncateTo: (id) =>
        set((s) => {
          const msgs = s.allMessages[s.currentScope] ?? []
          const idx = msgs.findIndex((m) => m.id === id)
          if (idx === -1) return s
          const removed = msgs.slice(idx).map((m) => m.id)
          const scopeDocs = { ...(s.allDocs[s.currentScope] ?? {}) }
          removed.forEach((rid) => delete scopeDocs[rid])
          return {
            allMessages: { ...s.allMessages, [s.currentScope]: msgs.slice(0, idx) },
            allDocs: { ...s.allDocs, [s.currentScope]: scopeDocs },
          }
        }),

      setCreatedDoc: (msgId, doc) =>
        set((s) => ({
          allDocs: {
            ...s.allDocs,
            [s.currentScope]: { ...(s.allDocs[s.currentScope] ?? {}), [msgId]: doc },
          },
        })),

      clear: () =>
        set((s) => ({
          allMessages: { ...s.allMessages, [s.currentScope]: [] },
          allDocs: { ...s.allDocs, [s.currentScope]: {} },
        })),

      notifyDocumentCreated: () => set({ docCreatedAt: Date.now() }),
    }),
    { name: "marrow-chat-v2" }
  )
)

// Convenience selectors — use these in components
export const selectMessages = (s: ChatStore) => s.allMessages[s.currentScope] ?? []
export const selectCreatedDocs = (s: ChatStore) => s.allDocs[s.currentScope] ?? {}
