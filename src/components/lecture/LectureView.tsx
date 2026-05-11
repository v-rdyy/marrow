"use client"

import { useRef, useEffect, useState, useCallback, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ChevronRight, Clock, BookOpen, Layers, Search, Zap, Folder as FolderIcon, RefreshCw, Camera, Globe, X, Loader2 } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { VideoPlayer } from "./VideoPlayer"
import { OutlineTab } from "./OutlineTab"
import { SummaryTab } from "./SummaryTab"
import { FlashcardsTab } from "./FlashcardsTab"
import { SearchTab } from "./SearchTab"
import { useUIStore } from "@/stores/ui-store"
import { useScreenshotStore } from "@/stores/screenshot-store"
import { useContextStore } from "@/stores/context-store"
import { RegionCapture } from "@/components/shared/RegionCapture"
import { SUPPORTED_LANGUAGES } from "@/types"
import type { Lecture, LectureContent, LectureTranslation } from "@/types"

interface BreadcrumbItem { id: string; name: string }

interface Props {
  lecture: Lecture
  content: LectureContent
  breadcrumb?: BreadcrumbItem[]
}

const TABS = [
  { key: "outline" as const, label: "Outline", icon: BookOpen },
  { key: "summary" as const, label: "Summary", icon: Layers },
  { key: "flashcards" as const, label: "Flashcards", icon: Zap },
  { key: "search" as const, label: "Search", icon: Search },
] as const

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

const LANG_OPTIONS = SUPPORTED_LANGUAGES.filter((l) => l.code !== "other")

export function LectureView({ lecture, content, breadcrumb = [] }: Props) {
  const { activeTab, setActiveTab, seekTarget } = useUIStore()
  const router = useRouter()
  const videoSectionRef = useRef<HTMLDivElement>(null)
  const mainScrollRef = useRef<HTMLDivElement>(null)
  const [regenState, setRegenState] = useState<"idle" | "loading" | "done">("idle")
  const [screenshotMode, setScreenshotMode] = useState(false)
  const { setPendingScreenshot } = useScreenshotStore()
  const { setLectureContext } = useContextStore()
  const hasNotes = !!content.lectureNotes
  const [titleValue, setTitleValue] = useState(lecture.title)
  const [renamingTitle, setRenamingTitle] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Translation state
  const [langMenuOpen, setLangMenuOpen] = useState(false)
  const [selectedLang, setSelectedLang] = useState<string | null>(null)
  const [translating, setTranslating] = useState(false)
  const [translation, setTranslation] = useState<LectureTranslation | null>(null)
  const translationCache = useRef<Record<string, LectureTranslation>>({})

  const selectLanguage = useCallback(async (lang: string) => {
    setLangMenuOpen(false)
    if (lang === selectedLang) return
    setSelectedLang(lang)

    if (translationCache.current[lang]) {
      setTranslation(translationCache.current[lang])
      return
    }

    setTranslating(true)
    try {
      const res = await fetch(`/api/lectures/${lecture.id}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
      })
      if (res.ok) {
        const { translation: t } = await res.json()
        translationCache.current[lang] = t
        setTranslation(t)
      } else {
        // Reset language selection on failure
        setSelectedLang(null)
      }
    } finally {
      setTranslating(false)
    }
  }, [lecture.id, selectedLang])

  const clearLanguage = useCallback(() => {
    setSelectedLang(null)
    setTranslation(null)
    setLangMenuOpen(false)
  }, [])

  // Merge translation over original content — tabs receive this
  const displayContent = useMemo((): LectureContent => {
    if (!translation) return content
    return {
      ...content,
      outline: translation.outline,
      summary90s: translation.summary90s,
      summary5min: translation.summary5min,
      summaryFull: translation.summaryFull,
      flashcards: translation.flashcards,
    }
  }, [content, translation])

  const regenNotes = useCallback(async () => {
    setRegenState("loading")
    try {
      await fetch(`/api/lectures/${lecture.id}/regen-notes`, { method: "POST" })
      setRegenState("done")
      // Reload after a beat so the tutor picks up the new notes
      setTimeout(() => window.location.reload(), 800)
    } catch {
      setRegenState("idle")
    }
  }, [lecture.id])

  useEffect(() => {
    if (seekTarget !== null && videoSectionRef.current) {
      videoSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [seekTarget])

  useEffect(() => {
    setLectureContext({ id: lecture.id, title: lecture.title })
    return () => setLectureContext(null)
  }, [lecture.id, lecture.title, setLectureContext])

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-1.5 px-4 py-2 border-b border-border bg-sidebar shrink-0 h-11 overflow-hidden">
        <button
          onClick={() => router.back()}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <BookOpen className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Marrow</span>
        </Link>

        {breadcrumb.map((item) => (
          <span key={item.id} className="flex items-center gap-1 shrink-0">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
            <button
              onClick={() => router.push(`/workspace/${item.id}`)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <FolderIcon className="h-3 w-3" />
              {item.name}
            </button>
          </span>
        ))}

        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
        {renamingTitle ? (
          <input
            ref={titleInputRef}
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={async () => {
              setRenamingTitle(false)
              const trimmed = titleValue.trim()
              if (trimmed && trimmed !== lecture.title) {
                await fetch(`/api/lectures/${lecture.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title: trimmed }),
                })
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); titleInputRef.current?.blur() }
              if (e.key === "Escape") { setRenamingTitle(false); setTitleValue(lecture.title) }
            }}
            className="flex-1 text-sm font-medium bg-transparent outline-none border-b border-foreground/30 text-foreground min-w-0"
            placeholder="Untitled"
          />
        ) : (
          <span
            className="text-sm font-medium truncate min-w-0 cursor-text hover:underline decoration-dotted underline-offset-2"
            title="Click to rename"
            onClick={() => { setTitleValue(lecture.title); setRenamingTitle(true); setTimeout(() => { titleInputRef.current?.focus(); titleInputRef.current?.select() }, 30) }}
          >
            {titleValue}
          </span>
        )}

        <div className="ml-auto flex items-center gap-3 shrink-0">
          <button
            onClick={() => setScreenshotMode(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="Screenshot video region"
          >
            <Camera className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Screenshot</span>
          </button>
          {!hasNotes && (
            <button
              onClick={regenNotes}
              disabled={regenState !== "idle"}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title="Generate AI tutor notes for this lecture"
            >
              <RefreshCw className={`h-3 w-3 ${regenState === "loading" ? "animate-spin" : ""}`} />
              <span>{regenState === "loading" ? "Generating…" : regenState === "done" ? "Done" : "Generate notes"}</span>
            </button>
          )}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>{formatDuration(lecture.durationSeconds)}</span>
          </div>
        </div>
      </header>

      {screenshotMode && (
        <RegionCapture
          onCapture={(base64, mimeType) => {
            setPendingScreenshot({ base64, mimeType, name: `${lecture.title} screenshot.jpg` })
          }}
          onClose={() => setScreenshotMode(false)}
        />
      )}

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Scrollable main column */}
        <div
          ref={mainScrollRef}
          className="flex-1 overflow-y-auto min-w-0"
        >
          {/* Video — centered at top */}
          <div ref={videoSectionRef} className="flex justify-center px-6 pt-5 pb-4 border-b border-border">
            <div className="w-full max-w-3xl space-y-3">
              <VideoPlayer videoId={lecture.videoId} />
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-snug">{lecture.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{lecture.channelName}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Clock className="h-3 w-3" />
                  <span>{formatDuration(lecture.durationSeconds)}</span>
                </div>
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>{content.outline.length} topics</span>
                <span>{content.flashcards.length} cards</span>
                <span>{content.chunks.length} segments</span>
              </div>
            </div>
          </div>

          {/* Study tools */}
          <div>
            <div className="sticky top-0 z-10 bg-background border-b border-border flex items-center gap-1 px-6 py-2">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                    activeTab === key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}

              {/* Language selector */}
              <div className="ml-auto relative">
                {selectedLang ? (
                  <div className="flex items-center gap-1">
                    {translating && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                    <button
                      onClick={() => setLangMenuOpen((o) => !o)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/20 hover:bg-primary/25 transition-colors"
                    >
                      <Globe className="h-3 w-3" />
                      {LANG_OPTIONS.find((l) => l.code === selectedLang)?.nativeLabel}
                    </button>
                    <button
                      onClick={clearLanguage}
                      className="p-1 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setLangMenuOpen((o) => !o)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    Translate
                  </button>
                )}

                {langMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setLangMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-30 w-44 rounded-lg border border-border bg-popover shadow-lg py-1 overflow-hidden">
                      {selectedLang && (
                        <button
                          onClick={clearLanguage}
                          className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
                        >
                          Original (English)
                        </button>
                      )}
                      {LANG_OPTIONS.map((l) => (
                        <button
                          key={l.code}
                          onClick={() => selectLanguage(l.code)}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                            selectedLang === l.code
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-accent text-foreground"
                          }`}
                        >
                          <span className="font-medium">{l.nativeLabel}</span>
                          <span className="text-muted-foreground ml-1">· {l.label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                {activeTab === "outline" && <OutlineTab outline={displayContent.outline} />}
                {activeTab === "summary" && <SummaryTab content={displayContent} />}
                {activeTab === "flashcards" && <FlashcardsTab flashcards={displayContent.flashcards} />}
                {activeTab === "search" && <SearchTab lectureId={lecture.id} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

      </div>
    </div>
  )
}
