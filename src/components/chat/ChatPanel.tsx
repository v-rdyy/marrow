"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { usePathname } from "next/navigation"
import { Send, Loader2, Bot, Maximize2, Minimize2, Paperclip, X, FileText, ExternalLink, Pencil, Eye, Search, Layers, Plus } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ClaimSource } from "@/components/lecture/ClaimSource"
import { useContextStore } from "@/stores/context-store"
import { useScreenshotStore } from "@/stores/screenshot-store"
import { useChatStore, selectMessages, selectCreatedDocs } from "@/stores/chat-store"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import "katex/dist/katex.min.css"
import { ContextChips } from "@/components/chat/ContextChips"
import type { ChatMessage, ToolCallRecord } from "@/types"

const SUGGESTIONS = [
  "Explain the main concept",
  "Quiz me on this",
  "Summarize key points",
  "What should I focus on?",
]

const DRAIN_CHARS = 4
const DRAIN_INTERVAL_MS = 18

interface LiveEntry {
  id: string
  name: string          // tool name, used for pending label
  meta?: ToolCallRecord // filled when done
  done: boolean
}

interface StreamingState {
  id: string
  currentStatus: string
  reasoning: LiveEntry[]
  hasText: boolean
}

interface Props {
  lectureId?: string
  lectureTitle?: string
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
  onClose?: () => void
  onDocumentCreated?: () => void
}

function Cursor() {
  return (
    <motion.span
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      className="inline-block w-[2px] h-[1em] bg-current align-middle ml-[1px]"
    />
  )
}

function StatusLine({ text }: { text: string }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={text}
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -3 }}
        transition={{ duration: 0.2 }}
        className="flex items-center gap-1.5 text-xs text-muted-foreground"
      >
        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
        <span>{text}</span>
      </motion.div>
    </AnimatePresence>
  )
}

interface Attachment {
  name: string
  base64: string
  mimeType: string
  previewUrl?: string
}

function ToolCallPill({ r }: { r: ToolCallRecord }) {
  const Icon =
    r.action === "Read"   ? Eye    :
    r.action === "Search" ? Search :
    r.action === "Create" ? Plus   :
    Layers

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/20 px-2 py-1 text-xs max-w-fit">
      <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground/70">{r.action} — {r.label}</span>
      {r.badge && (
        <span className="rounded px-1 py-px bg-muted text-muted-foreground/50 text-[10px] font-medium shrink-0">{r.badge}</span>
      )}
    </div>
  )
}

function LiveToolCallPill({ entry }: { entry: { id: string; name: string; meta?: ToolCallRecord; done: boolean } }) {
  if (entry.done && entry.meta) return <ToolCallPill r={entry.meta} />

  const pendingLabel =
    entry.name === "read_document"   ? "Reading document…" :
    entry.name === "read_lecture"    ? "Reading lecture…"  :
    entry.name === "search_lecture"  ? "Searching…"        :
    entry.name === "create_document" ? "Creating…"         :
    "Working…"

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/20 px-2 py-1 text-xs max-w-fit">
      <Loader2 className="h-3 w-3 text-muted-foreground animate-spin shrink-0" />
      <span className="text-muted-foreground/50">{pendingLabel}</span>
    </div>
  )
}

export function ChatPanel({ lectureId, lectureTitle, isFullscreen, onToggleFullscreen, onClose, onDocumentCreated }: Props) {
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState<StreamingState | null>(null)
  const [pendingScrollTo, setPendingScrollTo] = useState<string | null>(null)
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")

  const pathname = usePathname()
  const setScope = useChatStore((s) => s.setScope)
  useEffect(() => {
    const scope = pathname.split("/").filter(Boolean).pop() ?? "global"
    setScope(scope)
  }, [pathname, setScope])

  const messages = useChatStore(selectMessages)
  const createdDocs = useChatStore(selectCreatedDocs)
  const { addMessage, updateMessage, truncateTo, setCreatedDoc, clear, notifyDocumentCreated } = useChatStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const msgRefsMap = useRef<Map<string, HTMLDivElement>>(new Map())
  const { items: storeItems, remove: removeContextItem, lectureContext } = useContextStore()
  const { pendingScreenshot, setPendingScreenshot } = useScreenshotStore()

  const effectiveAttachment: Attachment | null = attachment ?? (pendingScreenshot ? {
    name: pendingScreenshot.name,
    base64: pendingScreenshot.base64,
    mimeType: pendingScreenshot.mimeType,
    previewUrl: `data:${pendingScreenshot.mimeType};base64,${pendingScreenshot.base64}`,
  } : null)

  const pendingRef = useRef("")
  const displayedRef = useRef("")
  const streamingIdRef = useRef<string | null>(null)
  const drainRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamDoneRef = useRef(false)

  const stopDrain = useCallback(() => {
    if (drainRef.current) { clearInterval(drainRef.current); drainRef.current = null }
  }, [])

  const startDrain = useCallback((id: string) => {
    if (drainRef.current) return
    drainRef.current = setInterval(() => {
      if (!pendingRef.current) {
        if (streamDoneRef.current) {
          stopDrain()
          setStreaming(null)
          streamingIdRef.current = null
        }
        return
      }
      const chars = pendingRef.current.slice(0, DRAIN_CHARS)
      pendingRef.current = pendingRef.current.slice(DRAIN_CHARS)
      displayedRef.current += chars
      updateMessage(id, { content: displayedRef.current })
    }, DRAIN_INTERVAL_MS)
  }, [stopDrain, updateMessage])

  useEffect(() => {
    if (!pendingScrollTo) return
    const el = msgRefsMap.current.get(pendingScrollTo)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
      setPendingScrollTo(null)
    }
  }, [messages, pendingScrollTo])

  useEffect(() => () => stopDrain(), [stopDrain])

  async function send(text: string) {
    if ((!text.trim() && !effectiveAttachment) || streaming) return

    stopDrain()
    pendingRef.current = ""
    displayedRef.current = ""
    streamDoneRef.current = false

    const currentAttachment = effectiveAttachment
    setAttachment(null)
    setPendingScreenshot(null)

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim() || (currentAttachment ? `[Attached: ${currentAttachment.name}]` : ""),
      createdAt: new Date().toISOString(),
    }
    addMessage(userMessage)
    setPendingScrollTo(userMessage.id)
    setInput("")

    const assistantId = crypto.randomUUID()
    streamingIdRef.current = assistantId
    const accumulatedReasoning: LiveEntry[] = []
    setStreaming({ id: assistantId, currentStatus: "", reasoning: [], hasText: false })

    const effectiveLectureId = lectureId ?? lectureContext?.id
    const effectiveLectureTitle = lectureTitle ?? lectureContext?.title

    const contextItems = [
      ...(effectiveLectureId ? [{ id: effectiveLectureId, type: "lecture" as const, label: effectiveLectureTitle ?? "", isPriority: true }] : []),
      ...storeItems.filter((c) => c.id !== effectiveLectureId),
    ]

    let assistantMsgAdded = false

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          history: messages.map((m) => ({ role: m.role, content: m.content })),
          contextItems,
          attachment: currentAttachment
            ? { name: currentAttachment.name, base64: currentAttachment.base64, mimeType: currentAttachment.mimeType }
            : undefined,
        }),
      })
      if (!res.body) throw new Error("No response body")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const chunk = JSON.parse(line)

            if (chunk.status !== undefined) {
              setStreaming((s) => s ? { ...s, currentStatus: chunk.status } : null)
            }

            if (chunk.tool_call_start) {
              accumulatedReasoning.push({ id: chunk.tool_call_start.id, name: chunk.tool_call_start.name, done: false })
              setStreaming((s) => s ? { ...s, reasoning: [...accumulatedReasoning] } : null)
            }

            if (chunk.tool_call_done) {
              const idx = accumulatedReasoning.findIndex((e) => e.id === chunk.tool_call_done.id)
              if (idx !== -1) {
                accumulatedReasoning[idx] = { ...accumulatedReasoning[idx], meta: chunk.tool_call_done.meta, done: true }
              }
              setStreaming((s) => s ? { ...s, reasoning: [...accumulatedReasoning] } : null)
            }

            if (chunk.text_start && !assistantMsgAdded) {
              addMessage({ id: assistantId, role: "assistant", content: "", createdAt: new Date().toISOString() })
              assistantMsgAdded = true
              setStreaming((s) => s ? { ...s, hasText: true, currentStatus: "" } : null)
              startDrain(assistantId)
            }

            if (chunk.text) {
              if (!assistantMsgAdded) {
                addMessage({ id: assistantId, role: "assistant", content: "", createdAt: new Date().toISOString() })
                assistantMsgAdded = true
                setStreaming((s) => s ? { ...s, hasText: true, currentStatus: "" } : null)
                startDrain(assistantId)
              }
              pendingRef.current += chunk.text
            }

            if (chunk.document_created) {
              setCreatedDoc(assistantId, chunk.document_created)
              notifyDocumentCreated()
              onDocumentCreated?.()
            }

            if (chunk.done) {
              if (assistantMsgAdded && accumulatedReasoning.length > 0) {
                const doneReasoning = accumulatedReasoning.filter((e) => e.done && e.meta).map((e) => e.meta!)
                updateMessage(assistantId, { reasoning: doneReasoning })
              }
              streamDoneRef.current = true
            }

            if (chunk.error) {
              stopDrain()
              setStreaming(null)
              streamingIdRef.current = null
              const errMsg: ChatMessage = { id: assistantId, role: "assistant", content: "Something went wrong. Try again.", createdAt: new Date().toISOString() }
              if (assistantMsgAdded) updateMessage(assistantId, { content: errMsg.content })
              else addMessage(errMsg)
            }
          } catch { /* ignore malformed lines */ }
        }
      }
    } catch {
      stopDrain()
      setStreaming(null)
      streamingIdRef.current = null
      const errMsg: ChatMessage = { id: assistantId, role: "assistant", content: "Something went wrong. Try again.", createdAt: new Date().toISOString() }
      if (assistantMsgAdded) updateMessage(assistantId, { content: errMsg.content })
      else addMessage(errMsg)
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.split(",")[1]
      setAttachment({
        name: file.name,
        base64,
        mimeType: file.type,
        previewUrl: file.type.startsWith("image/") ? dataUrl : undefined,
      })
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    send(input)
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Messages */}
      <div className="relative flex-1 overflow-hidden">
        {/* Top-right controls */}
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
          {onClose && (
            <button
              onClick={onClose}
              title="Close chat"
              className="rounded-lg bg-muted/60 p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              title={isFullscreen ? "Exit fullscreen (⌘M)" : "Fullscreen (⌘M)"}
              className="rounded-lg bg-muted/60 p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-10 bg-gradient-to-b from-background/80 to-transparent" />
        <ScrollArea className="h-full px-4 pt-10 pb-3">
          <div className={`space-y-4 ${isFullscreen ? "max-w-2xl mx-auto" : ""}`}>

            {messages.length === 0 && !streaming && (
              <div className="flex flex-col items-center gap-4 pt-6 px-1">
                <Bot className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground text-center">
                  Ask anything about your workspace
                </p>
                <div className="grid grid-cols-2 gap-1.5 w-full">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-lg border border-border bg-muted/50 px-2.5 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors leading-snug"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  ref={(el) => { if (el) msgRefsMap.current.set(msg.id, el); else msgRefsMap.current.delete(msg.id) }}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  {msg.role === "user" ? (
                    editingId === msg.id ? (
                      <div className="w-[85%] flex flex-col gap-1.5">
                        <textarea
                          autoFocus
                          rows={3}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault()
                              if (editText.trim()) {
                                setEditingId(null)
                                truncateTo(msg.id)
                                send(editText.trim())
                              }
                            }
                            if (e.key === "Escape") setEditingId(null)
                          }}
                          className="w-full rounded-xl px-3 py-2 text-sm bg-primary/15 border border-primary/30 outline-none resize-none text-foreground leading-relaxed"
                        />
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              if (editText.trim()) {
                                setEditingId(null)
                                truncateTo(msg.id)
                                send(editText.trim())
                              }
                            }}
                            className="text-xs bg-primary text-primary-foreground rounded-md px-2.5 py-1 hover:bg-primary/90 transition-colors"
                          >
                            Send
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="group/msg relative flex flex-col items-end">
                        <div className="rounded-2xl px-3 py-2 max-w-[85%] text-sm leading-relaxed bg-primary text-primary-foreground">
                          {msg.content}
                        </div>
                        {!streaming && (
                          <button
                            onClick={() => { setEditingId(msg.id); setEditText(msg.content) }}
                            className="opacity-0 group-hover/msg:opacity-100 absolute -left-7 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
                            title="Edit message"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )
                  ) : (
                    <div className="max-w-[92%] flex flex-col gap-1.5">
                    {streaming?.id === msg.id && streaming.reasoning.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {streaming.reasoning.map((entry) => (
                          <LiveToolCallPill key={entry.id} entry={entry} />
                        ))}
                      </div>
                    ) : msg.reasoning && msg.reasoning.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {msg.reasoning.map((r, i) => (
                          <ToolCallPill key={i} r={r} />
                        ))}
                      </div>
                    ) : null}
                    <div className="text-sm leading-relaxed text-foreground prose prose-sm prose-invert max-w-none
                      [&_p]:mb-2 [&_p:last-child]:mb-0
                      [&_ul]:mb-2 [&_ul]:pl-4 [&_ul]:list-disc
                      [&_ol]:mb-2 [&_ol]:pl-4 [&_ol]:list-decimal
                      [&_li]:mb-0.5
                      [&_strong]:font-semibold [&_strong]:text-foreground
                      [&_code]:rounded [&_code]:bg-muted/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono
                      [&_h1]:text-sm [&_h1]:font-semibold [&_h1]:mb-1
                      [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mb-1
                      [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:mb-1
                      [&_hr]:border-border [&_hr]:my-2">
                      <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
                        {streaming?.id === msg.id && streaming.hasText
                          ? msg.content + "​"
                          : msg.content
                        }
                      </ReactMarkdown>
                      {streaming?.id === msg.id && streaming.hasText && <Cursor />}
                    </div>
                    </div>
                  )}

                  {msg.role === "assistant" && msg.sourceTimestamps && msg.sourceTimestamps.length > 0 && msg.content && (
                    <div className="flex flex-wrap gap-1">
                      <span className="text-xs text-muted-foreground">Sources:</span>
                      {msg.sourceTimestamps.map((ts, i) => (
                        <ClaimSource key={i} timestamp={ts} />
                      ))}
                    </div>
                  )}

                  {msg.role === "assistant" && createdDocs[msg.id] && (
                    <a
                      href={`/document/${createdDocs[msg.id].id}`}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors max-w-fit"
                    >
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate max-w-[160px]">{createdDocs[msg.id].title}</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                    </a>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {streaming && !streaming.hasText && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col gap-1.5"
              >
                {streaming.reasoning.map((entry) => (
                  <LiveToolCallPill key={entry.id} entry={entry} />
                ))}
                {/* Current status */}
                {streaming.currentStatus ? (
                  <StatusLine text={streaming.currentStatus} />
                ) : (
                  <div className="flex gap-1 items-center">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="block h-1.5 w-1.5 rounded-full bg-muted-foreground/40"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </ScrollArea>
      </div>

      {storeItems.filter((i) => i.type !== "workspace").length > 0 && (
        <div className="border-t border-sidebar-border">
          <ContextChips items={storeItems.filter((i) => i.type !== "workspace")} onRemove={removeContextItem} />
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="p-3 border-t border-sidebar-border shrink-0">
        <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFile} />
        <div className="rounded-xl border border-border bg-background overflow-hidden focus-within:border-foreground/25 transition-colors">
          {effectiveAttachment && (
            <div className="flex items-center gap-2 px-4 pt-2.5 pb-0">
              <div className="flex items-center gap-1.5 bg-muted/60 border border-border rounded-md px-2 py-1 text-xs text-foreground max-w-full min-w-0">
                {effectiveAttachment.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={effectiveAttachment.previewUrl} alt="" className="h-4 w-4 rounded object-cover shrink-0" />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="truncate max-w-[140px]">{effectiveAttachment.name}</span>
                <button
                  type="button"
                  onClick={() => { setAttachment(null); setPendingScreenshot(null) }}
                  className="ml-0.5 text-muted-foreground hover:text-foreground shrink-0"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
          <input
            placeholder="Ask anything…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!!streaming}
            className="w-full px-4 pt-3 pb-1.5 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground/40 disabled:opacity-50"
          />
          <div className="flex items-center justify-between px-3 pb-2.5">
            <span className="text-[11px] text-muted-foreground/40 font-medium">Claude Sonnet 4.6</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!!streaming}
                className="rounded-full p-1 text-muted-foreground/50 hover:text-muted-foreground disabled:opacity-30 transition-colors"
                title="Attach image or PDF"
              >
                <Paperclip className="h-3.5 w-3.5" />
              </button>
              <button
                type="submit"
                disabled={!!streaming || (!input.trim() && !effectiveAttachment)}
                className="rounded-full bg-foreground text-background h-7 w-7 flex items-center justify-center hover:bg-foreground/85 disabled:opacity-30 transition-all shrink-0"
              >
                {streaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
