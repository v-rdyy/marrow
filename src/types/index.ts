// Core domain types for Marrow

export type ProcessingStatus = "pending" | "processing" | "completed" | "failed"

export type CardColor = "default" | "indigo" | "orange" | "green" | "pink" | "purple" | "cyan" | "yellow"

export const CARD_COLORS: { key: CardColor; label: string; bg: string; border: string; text: string; swatch: string }[] = [
  { key: "default", label: "Default", bg: "bg-card",                         border: "border",                                   text: "text-foreground",                        swatch: "bg-zinc-600" },
  { key: "indigo",  label: "Indigo",  bg: "bg-indigo-950",                   border: "border-indigo-800",                        text: "text-indigo-300",                        swatch: "bg-indigo-500" },
  { key: "orange",  label: "Orange",  bg: "bg-orange-950",                   border: "border-orange-800",                        text: "text-orange-300",                        swatch: "bg-orange-500" },
  { key: "green",   label: "Green",   bg: "bg-green-950",                    border: "border-green-800",                         text: "text-green-300",                         swatch: "bg-green-500" },
  { key: "pink",    label: "Pink",    bg: "bg-pink-950",                     border: "border-pink-800",                          text: "text-pink-300",                          swatch: "bg-pink-500" },
  { key: "purple",  label: "Purple",  bg: "bg-purple-950",                   border: "border-purple-800",                        text: "text-purple-300",                        swatch: "bg-purple-500" },
  { key: "cyan",    label: "Cyan",    bg: "bg-cyan-950",                     border: "border-cyan-800",                          text: "text-cyan-300",                          swatch: "bg-cyan-500" },
  { key: "yellow",  label: "Yellow",  bg: "bg-yellow-950",                   border: "border-yellow-800",                        text: "text-yellow-300",                        swatch: "bg-yellow-500" },
]

// Vivid item colors for lectures, documents (ThinkEx-style)
export const ITEM_PALETTE = [
  "#e11d48", "#db2777", "#c026d3", "#7c3aed",
  "#4f46e5", "#0284c7", "#0891b2", "#0d9488",
  "#16a34a", "#65a30d", "#ca8a04", "#ea580c",
  "#dc2626", "#9333ea", "#2563eb", "#059669",
]

// Hash an item ID to a consistent color
export function itemColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  return ITEM_PALETTE[Math.abs(hash) % ITEM_PALETTE.length]
}

// A single transcript chunk — the atomic unit everything is built on
export type Chunk = {
  id: string        // "chunk_042"
  start: number     // seconds
  end: number       // seconds
  text: string
}

// Every AI-generated claim carries its source chunks for attribution
export type ClaimedText = {
  text: string
  sourceChunkIds: string[]
}

// Outline node — nested, each node traceable to a timestamp
export type OutlineNode = {
  title: string
  chunkId: string
  timestamp: number  // seconds
  children: OutlineNode[]
}

// Summary paragraph with source attribution
export type SummaryParagraph = {
  text: string
  sourceChunkIds: string[]
}

export type Flashcard = {
  id: string
  question: string
  answer: string
  sourceChunkId: string
  timestamp: number  // seconds
}

// Tutor chat message
export type ToolCallRecord = {
  action: string   // "Read" | "Search" | "Browse" | "Create"
  label: string    // item name or query text
  badge?: string   // "document" | "PDF" | "lecture" | "workspace"
}

export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  sourceTimestamps?: number[]
  reasoning?: ToolCallRecord[]
  createdAt: string
}

// Folder — workspace or sub-folder container
export type Folder = {
  id: string
  name: string
  color: CardColor
  sortOrder: number
  createdAt: string
  parentId: string | null   // null = root workspace
  lectureCount?: number
  documentCount?: number
  folderCount?: number
}

// Document (rich text note or PDF)
export type Document = {
  id: string
  folderId: string | null
  title: string
  content: string  // HTML from Tiptap (empty for PDFs)
  type: "text" | "pdf"
  fileUrl: string | null    // Supabase storage URL for PDFs
  sortOrder: number
  createdAt: string
  updatedAt: string
  color?: string  // hex color, falls back to itemColor(id)
}

// Lecture as stored in DB
export type Lecture = {
  id: string
  folderId: string | null
  title: string
  youtubeUrl: string
  videoId: string
  thumbnailUrl: string
  durationSeconds: number
  channelName: string
  processingStatus: ProcessingStatus
  errorMessage?: string
  sortOrder: number
  createdAt: string
  color?: string  // hex color, falls back to itemColor(id)
}

// All generated content for a lecture
export type LectureContent = {
  lectureId: string
  chunks: Chunk[]
  outline: OutlineNode[]
  summary90s: SummaryParagraph[]
  summary5min: SummaryParagraph[]
  summaryFull: SummaryParagraph[]
  flashcards: Flashcard[]
  lectureNotes?: string                        // detailed timestamped notes for AI tutor
  chunkDescriptions?: Record<string, string>  // brief per-chunk descriptions for search previews
  // embeddings stored separately, not loaded into client
}

// SSE event types streamed during processing
export type ProcessingEvent =
  | { type: "ingest_start" }
  | { type: "ingest_done"; chunkCount: number; durationSeconds: number; title: string; thumbnailUrl: string; channelName: string }
  | { type: "ingest_error"; message: string }
  | { type: "content_start" }
  | { type: "outline_done"; outline: OutlineNode[] }
  | { type: "flashcards_done"; flashcards: Flashcard[] }
  | { type: "summary_90s_done"; paragraphs: SummaryParagraph[] }
  | { type: "summary_5min_done"; paragraphs: SummaryParagraph[] }
  | { type: "summary_full_done"; paragraphs: SummaryParagraph[] }
  | { type: "embed_start"; chunkCount: number }
  | { type: "embed_done" }
  | { type: "completed" }
  | { type: "error"; message: string }

export type SummaryDepth = "90s" | "5min" | "full"

// Context item passed to the AI chat — represents something the user wants in context
export type ContextItemType = "workspace" | "folder" | "document" | "lecture" | "text-selection" | "image"

export type ContextItem = {
  id: string
  type: ContextItemType
  label: string
  content?: string       // pre-loaded text (workspace overviews, text selections, small docs)
  imageBase64?: string   // for screenshot capture
  isPriority?: boolean   // selected items / current doc get elevated in prompt
}

export type SearchResult = {
  chunkId: string
  start: number
  end: number
  text: string
  score: number
  description?: string  // concise one-line preview from chunk_descriptions
}

// Cached translation of a lecture's study content (text only — all timestamps/ids preserved)
export type LectureTranslation = {
  lectureId: string
  lang: string
  outline: OutlineNode[]
  summary90s: SummaryParagraph[]
  summary5min: SummaryParagraph[]
  summaryFull: SummaryParagraph[]
  flashcards: Flashcard[]
}

export type SupportedLanguage = {
  code: string
  label: string
  nativeLabel: string
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "zh", label: "Mandarin", nativeLabel: "中文" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português" },
  { code: "ko", label: "Korean", nativeLabel: "한국어" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語" },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
  { code: "other", label: "Other...", nativeLabel: "Other..." },
]
