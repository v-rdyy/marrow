import { create } from "zustand"
import type { SummaryDepth } from "@/types"

interface UIStore {
  // Workspace navigation
  activeFolderId: string | null
  setActiveFolderId: (id: string | null) => void

  // Active summary depth in the lecture view
  activeSummaryDepth: SummaryDepth
  setActiveSummaryDepth: (depth: SummaryDepth) => void

  // Active lecture view tab
  activeTab: "outline" | "summary" | "flashcards" | "search" | "translate"
  setActiveTab: (tab: UIStore["activeTab"]) => void

  // Currently selected language for translation
  translationLanguage: string | null
  setTranslationLanguage: (lang: string | null) => void

  // YouTube player seek target (seconds) — components watch this and seek on change
  seekTarget: number | null
  seekTo: (seconds: number) => void
  clearSeekTarget: () => void

  // Sidebar open/collapsed
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  activeFolderId: null,
  setActiveFolderId: (id) => set({ activeFolderId: id }),

  activeSummaryDepth: "5min",
  setActiveSummaryDepth: (depth) => set({ activeSummaryDepth: depth }),

  activeTab: "outline",
  setActiveTab: (tab) => set({ activeTab: tab }),

  translationLanguage: null,
  setTranslationLanguage: (lang) => set({ translationLanguage: lang }),

  seekTarget: null,
  seekTo: (seconds) => set({ seekTarget: seconds }),
  clearSeekTarget: () => set({ seekTarget: null }),

  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}))
