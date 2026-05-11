import { create } from "zustand"

interface ScreenshotStore {
  // Pending screenshot to be auto-attached to the next chat message
  pendingScreenshot: { base64: string; name: string; mimeType: string } | null
  setPendingScreenshot: (s: { base64: string; name: string; mimeType: string } | null) => void
}

export const useScreenshotStore = create<ScreenshotStore>((set) => ({
  pendingScreenshot: null,
  setPendingScreenshot: (s) => set({ pendingScreenshot: s }),
}))
