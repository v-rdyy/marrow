import { create } from "zustand"

type BreadcrumbItem = { id: string; name: string }

interface NavState {
  pendingBreadcrumb: BreadcrumbItem[]
  setPendingBreadcrumb: (items: BreadcrumbItem[]) => void
  clearPendingBreadcrumb: () => void
}

export const useNavStore = create<NavState>((set) => ({
  pendingBreadcrumb: [],
  setPendingBreadcrumb: (items) => set({ pendingBreadcrumb: items }),
  clearPendingBreadcrumb: () => set({ pendingBreadcrumb: [] }),
}))
