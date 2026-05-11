"use client"

import { useState, useCallback } from "react"
import { Camera, X } from "lucide-react"

interface Rect { x: number; y: number; w: number; h: number }

interface Props {
  /** Container element whose canvas children to crop from (PDF mode). Omit for screen-capture mode. */
  canvasContainer?: HTMLElement | null
  onCapture: (base64: string, mimeType: string) => void
  onClose: () => void
}

// Crop from pdfjs canvas elements inside container
async function cropFromCanvas(container: HTMLElement, sel: Rect): Promise<string | null> {
  const canvases = Array.from(container.querySelectorAll<HTMLCanvasElement>("canvas"))
  for (const canvas of canvases) {
    const r = canvas.getBoundingClientRect()
    const ix = Math.max(sel.x, r.left) - r.left
    const iy = Math.max(sel.y, r.top) - r.top
    const iw = Math.min(sel.x + sel.w, r.right) - Math.max(sel.x, r.left)
    const ih = Math.min(sel.y + sel.h, r.bottom) - Math.max(sel.y, r.top)
    if (iw <= 4 || ih <= 4) continue
    const sx = canvas.width / r.width
    const sy = canvas.height / r.height
    const out = document.createElement("canvas")
    out.width = Math.round(iw * sx)
    out.height = Math.round(ih * sy)
    const ctx = out.getContext("2d")
    if (!ctx) continue
    ctx.drawImage(canvas, ix * sx, iy * sy, iw * sx, ih * sy, 0, 0, out.width, out.height)
    return out.toDataURL("image/jpeg", 0.9)
  }
  return null
}

// Capture a region from an already-acquired MediaStream using video+canvas (universally supported).
// The overlay must be removed from the DOM before calling this.
async function captureFromStream(stream: MediaStream, sel: Rect): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video")
    video.muted = true
    video.playsInline = true
    video.srcObject = stream

    video.onloadedmetadata = async () => {
      try {
        await video.play()
        const scaleX = video.videoWidth / window.innerWidth
        const scaleY = video.videoHeight / window.innerHeight
        const out = document.createElement("canvas")
        out.width = Math.max(1, Math.round(sel.w * scaleX))
        out.height = Math.max(1, Math.round(sel.h * scaleY))
        const ctx = out.getContext("2d")
        if (!ctx) { resolve(null); return }
        ctx.drawImage(
          video,
          sel.x * scaleX, sel.y * scaleY, sel.w * scaleX, sel.h * scaleY,
          0, 0, out.width, out.height
        )
        resolve(out.toDataURL("image/jpeg", 0.9))
      } catch {
        resolve(null)
      } finally {
        stream.getTracks().forEach((t) => t.stop())
      }
    }

    video.onerror = () => { stream.getTracks().forEach((t) => t.stop()); resolve(null) }
  })
}

export function RegionCapture({ canvasContainer, onCapture, onClose }: Props) {
  const [drag, setDrag] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null)
  const [capturing, setCapturing] = useState(false)

  const selRect = drag
    ? {
        x: Math.min(drag.startX, drag.endX),
        y: Math.min(drag.startY, drag.endY),
        w: Math.abs(drag.endX - drag.startX),
        h: Math.abs(drag.endY - drag.startY),
      }
    : null

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    setDrag({ startX: e.clientX, startY: e.clientY, endX: e.clientX, endY: e.clientY })
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drag) return
    setDrag((d) => d ? { ...d, endX: e.clientX, endY: e.clientY } : null)
  }, [drag])

  const onMouseUp = useCallback(async (e: React.MouseEvent) => {
    if (!drag) return
    const final = {
      x: Math.min(drag.startX, e.clientX),
      y: Math.min(drag.startY, e.clientY),
      w: Math.abs(e.clientX - drag.startX),
      h: Math.abs(e.clientY - drag.startY),
    }
    setDrag(null)
    if (final.w < 10 || final.h < 10) return

    if (canvasContainer) {
      // PDF mode: crop directly from canvas — overlay doesn't interfere
      setCapturing(true)
      const base64 = await cropFromCanvas(canvasContainer, final)
      setCapturing(false)
      if (base64) onCapture(base64.split(",")[1], "image/jpeg")
      onClose()
    } else {
      // Screen capture mode:
      // 1. Acquire stream (user picks "This Tab" in browser dialog)
      // 2. Close overlay FIRST so it's not visible in the captured frame
      // 3. Wait for the browser to repaint without the overlay
      // 4. Then capture
      setCapturing(true)
      try {
        const opts: DisplayMediaStreamOptions & { preferCurrentTab?: boolean } = {
          video: true,
          preferCurrentTab: true,
        }
        const stream = await navigator.mediaDevices.getDisplayMedia(opts)
        setCapturing(false)
        onClose() // removes the dim overlay from DOM
        // Give the browser two frames to repaint without the overlay
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
        const base64 = await captureFromStream(stream, final)
        if (base64) onCapture(base64.split(",")[1], "image/jpeg")
      } catch {
        setCapturing(false)
        onClose()
      }
    }
  }, [drag, canvasContainer, onCapture, onClose])

  return (
    <div
      className="fixed inset-0 z-[100]"
      style={{ cursor: capturing ? "wait" : "crosshair" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {/* Dim overlay */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Instructions */}
      {!drag && !capturing && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-background/90 border border-border rounded-lg px-4 py-2 flex items-center gap-2 shadow-xl text-sm text-foreground pointer-events-none select-none">
          <Camera className="h-4 w-4 text-muted-foreground shrink-0" />
          {canvasContainer ? "Drag to select a region" : 'Drag a region, then select "This Tab" in the browser dialog'}
        </div>
      )}

      {/* Selection rect */}
      {selRect && selRect.w > 2 && selRect.h > 2 && (
        <div
          className="absolute border-2 border-primary bg-primary/10 pointer-events-none"
          style={{ left: selRect.x, top: selRect.y, width: selRect.w, height: selRect.h }}
        />
      )}

      {/* Capturing spinner */}
      {capturing && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background/90 border border-border rounded-lg px-5 py-3 text-sm text-foreground shadow-xl">
          Capturing…
        </div>
      )}

      {/* Close button */}
      <button
        className="absolute top-4 right-4 rounded-full bg-background/90 border border-border p-1.5 text-muted-foreground hover:text-foreground transition-colors shadow-lg pointer-events-auto"
        onMouseDown={(e) => { e.stopPropagation(); onClose() }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
