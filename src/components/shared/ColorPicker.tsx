"use client"

import { Check, X } from "lucide-react"

// 4 columns × 4 rows = 16 vivid colors, matching ThinkEx-style
const ROWS = [
  ["#f43f5e", "#db2777", "#9333ea", "#7c3aed"],
  ["#4f46e5", "#2563eb", "#0284c7", "#0891b2"],
  ["#0d9488", "#16a34a", "#65a30d", "#ca8a04"],
  ["#ea580c", "#dc2626", "#6d28d9", "#0369a1"],
]

interface Props {
  current: string
  onChange: (hex: string) => void
  onClose: () => void
}

export function ColorPicker({ current, onChange, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-background border border-border rounded-2xl shadow-2xl p-6 w-72">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold">Choose a Color</h3>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {ROWS.flat().map((hex) => (
            <button
              key={hex}
              onClick={() => { onChange(hex); onClose() }}
              className="relative h-12 rounded-lg transition-transform hover:scale-105 active:scale-95"
              style={{ backgroundColor: hex }}
            >
              {current === hex && (
                <Check className="absolute inset-0 m-auto h-5 w-5 text-white drop-shadow" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
