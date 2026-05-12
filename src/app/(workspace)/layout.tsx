"use client"

import { useState, useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import { ChatPanel } from "@/components/chat/ChatPanel"
import { MessageSquare } from "lucide-react"
import { useChatStore } from "@/stores/chat-store"

export default function WorkspaceGroupLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const setScope = useChatStore((s) => s.setScope)

  // Scope chat to the current page's ID (last path segment)
  // /workspace/abc → "abc", /lecture/xyz → "xyz", etc.
  useEffect(() => {
    const scope = pathname.split("/").filter(Boolean).pop() ?? "global"
    setScope(scope)
  }, [pathname, setScope])
  const [chatVisible, setChatVisible] = useState(true)
  const [chatFullscreen, setChatFullscreen] = useState(false)

  // Refs so the keydown closure always reads current state
  const chatVisibleRef = useRef(chatVisible)
  const chatFullscreenRef = useRef(chatFullscreen)
  useEffect(() => { chatVisibleRef.current = chatVisible }, [chatVisible])
  useEffect(() => { chatFullscreenRef.current = chatFullscreen }, [chatFullscreen])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "m" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (!chatVisibleRef.current) {
          setChatVisible(true)
        } else {
          setChatFullscreen((f) => !f)
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Main content — CSS hidden keeps children mounted during fullscreen */}
      <div className={`flex-1 min-w-0 overflow-hidden ${chatFullscreen ? "hidden" : ""}`}>
        {children}
      </div>

      {/* Divider — only when chat is visible and not fullscreen */}
      {chatVisible && !chatFullscreen && <div className="w-px bg-border shrink-0" />}

      {/* Thin strip — shown when chat is hidden; stays in layout flow so it can't overlap page headers */}
      {!chatVisible && (
        <div className="shrink-0 w-10 border-l border-border flex flex-col items-center pt-2">
          <button
            onClick={() => setChatVisible(true)}
            title="Open AI Chat"
            className="rounded-lg bg-muted/60 p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Chat panel — always mounted so input text and context are preserved when closed */}
      <div className={`flex flex-col overflow-hidden bg-background border-l border-border ${
        !chatVisible
          ? "hidden"
          : chatFullscreen
          ? "flex-1 border-l-0"
          : "w-[380px] shrink-0"
      }`}>
        <ChatPanel
          isFullscreen={chatFullscreen}
          onToggleFullscreen={() => setChatFullscreen((f) => !f)}
          onClose={() => { setChatVisible(false); setChatFullscreen(false) }}
        />
      </div>
    </div>
  )
}
