import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { searchChunks } from "@/lib/agents/search-agent"
import { extractPdfText } from "@/lib/pdf-extract"
import Anthropic from "@anthropic-ai/sdk"
import type { ContextItem, ToolCallRecord } from "@/types"

export const maxDuration = 300

type HistoryMsg = { role: "user" | "assistant"; content: string }
type AttachmentPayload = { name: string; base64: string; mimeType: string }

// ─── Tool definitions ────────────────────────────────────────────────────────

const LIST_WORKSPACE_TOOL: Anthropic.Tool = {
  name: "list_workspace",
  description:
    "List every document, lecture, PDF, and folder in the user's workspace with their IDs. " +
    "Call this first whenever the user asks about workspace content so you know what exists.",
  input_schema: { type: "object" as const, properties: {} },
}

const READ_DOCUMENT_TOOL: Anthropic.Tool = {
  name: "read_document",
  description:
    "Read the full text content of a document by ID. Returns the complete text so you can find and quote exact passages.",
  input_schema: {
    type: "object" as const,
    properties: {
      document_id: { type: "string", description: "ID from list_workspace" },
    },
    required: ["document_id"],
  },
}

const READ_LECTURE_TOOL: Anthropic.Tool = {
  name: "read_lecture",
  description:
    "Read the AI-generated notes, timestamped outline, and full summary for a lecture. " +
    "Returns structured content you can quote from directly.",
  input_schema: {
    type: "object" as const,
    properties: {
      lecture_id: { type: "string", description: "ID from list_workspace" },
    },
    required: ["lecture_id"],
  },
}

const SEARCH_LECTURE_TOOL: Anthropic.Tool = {
  name: "search_lecture",
  description:
    "Semantically search a lecture's transcript for specific passages. Returns exact quotes with timestamps. " +
    "Use this to find where specific concepts, explanations, or claims appear in a lecture.",
  input_schema: {
    type: "object" as const,
    properties: {
      lecture_id: { type: "string", description: "ID from list_workspace" },
      query: { type: "string", description: "What to search for — be specific" },
    },
    required: ["lecture_id", "query"],
  },
}

const CREATE_DOCUMENT_TOOL: Anthropic.Tool = {
  name: "create_document",
  description:
    "Create a new document in the user's Marrow workspace. Use when the user asks to create, write, draft, or generate a document, note, summary, or structured content. " +
    "Content must be valid HTML: <h1>-<h3> headings, <p> paragraphs, <ul>/<ol>/<li> lists, <strong>/<em> formatting, <code> inline code, <pre><code> blocks, <blockquote> quotes. " +
    "For math use LaTeX: \\( \\) inline, \\[ \\] block. Do NOT use markdown.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string" },
      content: { type: "string", description: "HTML content — no markdown" },
      folderId: { type: "string", description: "Optional. Only include if user explicitly named a folder." },
    },
    required: ["title", "content"],
  },
}

const ALL_TOOLS = [LIST_WORKSPACE_TOOL, READ_DOCUMENT_TOOL, READ_LECTURE_TOOL, SEARCH_LECTURE_TOOL, CREATE_DOCUMENT_TOOL]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripHtml(html: string) {
  return (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

function fmtTime(secs: number) {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

function toolLabel(name: string, input?: Record<string, unknown>): string {
  switch (name) {
    case "list_workspace": return "Browsing workspace…"
    case "read_document":  return "Reading document…"
    case "read_lecture":   return "Reading lecture notes…"
    case "search_lecture": return input?.query ? `Searching for "${input.query}"…` : "Searching lecture…"
    case "create_document": return input?.title ? `Creating "${input.title}"…` : "Creating document…"
    default: return "Working…"
  }
}

// ─── Tool executors ───────────────────────────────────────────────────────────

type ExecResult = { result: string; meta: ToolCallRecord }

async function execListWorkspace(supabase: ReturnType<typeof createServiceClient>): Promise<ExecResult> {
  const [{ data: folders }, { data: lectures }, { data: docs }] = await Promise.all([
    supabase.from("folders").select("id, name").order("name"),
    supabase.from("lectures").select("id, title, channel_name, processing_status").order("created_at", { ascending: false }),
    supabase.from("documents").select("id, title, type").order("created_at", { ascending: false }),
  ])

  const lines: string[] = ["WORKSPACE CONTENTS:"]
  if (folders?.length) {
    lines.push(`\nFOLDERS (${folders.length}):`)
    folders.forEach((f) => lines.push(`  - "${f.name}" [id: ${f.id}]`))
  }
  if (lectures?.length) {
    lines.push(`\nLECTURES (${lectures.length}):`)
    lectures.forEach((l) =>
      lines.push(`  - "${l.title}" by ${l.channel_name ?? "unknown"} [id: ${l.id}] [status: ${l.processing_status}]`)
    )
  }
  if (docs?.length) {
    lines.push(`\nDOCUMENTS / PDFs (${docs.length}):`)
    docs.forEach((d) => lines.push(`  - "${d.title || "Untitled"}" [id: ${d.id}] [type: ${d.type}]`))
  }
  if (!folders?.length && !lectures?.length && !docs?.length) lines.push("Workspace is empty.")
  return { result: lines.join("\n"), meta: { action: "Browse", label: "workspace", badge: "workspace" } }
}

async function execReadDocument(
  supabase: ReturnType<typeof createServiceClient>,
  documentId: string,
  emit: (e: object) => void
): Promise<ExecResult> {
  const { data, error } = await supabase
    .from("documents")
    .select("title, content, type, file_url")
    .eq("id", documentId)
    .single()
  if (error || !data) return { result: `Document not found: ${documentId}`, meta: { action: "Read", label: "unknown" } }

  const isPdf = data.type === "pdf" || !!data.file_url
  const badge = isPdf ? "PDF" : "document"
  const title = data.title || "Untitled"

  // PDF with already-extracted text
  if (isPdf && data.content && data.content.trim().length > 50) {
    return { result: `DOCUMENT: "${title}" (PDF)\n\n${data.content}`, meta: { action: "Read", label: title, badge } }
  }

  // PDF without extracted text — extract now and cache
  if (isPdf && data.file_url) {
    emit({ status: `Extracting "${title}"…` })
    try {
      // Prefer Supabase storage download (works regardless of bucket visibility)
      // Derive the storage path from the public URL: .../public/pdfs/<path>
      const urlObj = new URL(data.file_url)
      const pathParts = urlObj.pathname.split("/public/pdfs/")
      let pdfBytes: ArrayBuffer | null = null

      if (pathParts.length === 2) {
        const storagePath = decodeURIComponent(pathParts[1])
        const { data: blob } = await supabase.storage.from("pdfs").download(storagePath)
        if (blob) pdfBytes = await blob.arrayBuffer()
      }

      // Fallback to direct fetch
      if (!pdfBytes) {
        const res = await fetch(data.file_url)
        if (res.ok) pdfBytes = await res.arrayBuffer()
      }

      if (pdfBytes) {
        const extracted = await extractPdfText(pdfBytes)
        if (extracted.trim().length > 10) {
          await supabase.from("documents").update({ content: extracted }).eq("id", documentId)
          return { result: `DOCUMENT: "${title}" (PDF)\n\n${extracted}`, meta: { action: "Read", label: title, badge } }
        }
      }
    } catch (e) {
      console.error("PDF extraction error for", title, e)
    }
    return {
      result: `DOCUMENT: "${title}" (PDF)\nText extraction failed for this PDF. The user can select text in the viewer or use the screenshot tool to share specific content.`,
      meta: { action: "Read", label: title, badge },
    }
  }

  // Regular text document
  const text = stripHtml(data.content || "")
  return {
    result: `DOCUMENT: "${title}"\n\n${text || "(empty — nothing written yet)"}`,
    meta: { action: "Read", label: title, badge },
  }
}

async function execReadLecture(
  supabase: ReturnType<typeof createServiceClient>,
  lectureId: string
): Promise<ExecResult> {
  const [{ data: lecture }, { data: content }] = await Promise.all([
    supabase.from("lectures").select("title, channel_name").eq("id", lectureId).single(),
    supabase.from("lecture_content").select("lecture_notes, outline, summary_full").eq("lecture_id", lectureId).single(),
  ])

  const title = lecture?.title || "Unknown lecture"
  const meta: ToolCallRecord = { action: "Read", label: title, badge: "lecture" }

  if (!lecture) return { result: `Lecture not found: ${lectureId}`, meta }
  if (!content) return { result: `LECTURE: "${title}"\nNot yet processed — no content available yet.`, meta }

  const parts = [`LECTURE: "${title}" by ${lecture.channel_name ?? "unknown"}`]

  if (content.lecture_notes) {
    parts.push(`\n=== FULL NOTES ===\n${content.lecture_notes}`)
  } else {
    if (Array.isArray(content.outline) && content.outline.length > 0) {
      const tree = (
        content.outline as { title: string; timestamp: number; children?: { title: string; timestamp?: number }[] }[]
      )
        .map(
          (n) =>
            `[${fmtTime(n.timestamp)}] ${n.title}` +
            (n.children?.length
              ? "\n" + n.children.map((c) => `  [${fmtTime(c.timestamp ?? 0)}] ${c.title}`).join("\n")
              : "")
        )
        .join("\n")
      parts.push(`\n=== OUTLINE ===\n${tree}`)
    }
    if (Array.isArray(content.summary_full) && content.summary_full.length > 0) {
      const sum = (content.summary_full as { text: string }[]).map((p) => p.text).join("\n\n")
      parts.push(`\n=== SUMMARY ===\n${sum}`)
    }
    if (parts.length === 1) parts.push("Notes not generated yet. User can click \"Generate notes\" on the lecture page.")
  }

  return { result: parts.join("\n"), meta }
}

async function execSearchLecture(
  supabase: ReturnType<typeof createServiceClient>,
  lectureId: string,
  query: string
): Promise<ExecResult> {
  const meta: ToolCallRecord = { action: "Search", label: query, badge: "lecture" }

  const { data } = await supabase
    .from("lecture_content")
    .select("embeddings, chunk_descriptions")
    .eq("lecture_id", lectureId)
    .single()

  if (!data?.embeddings) {
    return { result: `Search index not ready. Use read_lecture instead.`, meta }
  }

  try {
    const results = await searchChunks(query, data.embeddings)
    if (results.length === 0) return { result: `No results for "${query}". Try a different query or use read_lecture.`, meta }

    const descriptions: Record<string, string> = data.chunk_descriptions ?? {}
    const formatted = results
      .map(
        (r) =>
          `[${fmtTime(r.start)}–${fmtTime(r.end)}]\n"${r.text}"` +
          (descriptions[r.chunkId] ? `\n(${descriptions[r.chunkId]})` : "")
      )
      .join("\n\n")

    return { result: `SEARCH: "${query}" — ${results.length} result${results.length !== 1 ? "s" : ""}:\n\n${formatted}`, meta }
  } catch {
    return { result: `Search failed. Try read_lecture instead.`, meta }
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(contextItems: ContextItem[]): string {
  const parts = [
    `You are an AI study assistant in Marrow. You have tools to find and read ANY content in the user's workspace. Use them proactively — never tell the user you can't access something.

CRITICAL — NEVER narrate tool use in your text. Do NOT write phrases like "Let me look up…", "I'll check…", "Found it!", "Let me read…", "Searching for…", "I'll search the workspace…", or any text describing what you are doing. The UI shows tool activity automatically. Use tools silently, then respond directly with your answer.

WORKFLOW FOR EVERY QUESTION ABOUT WORKSPACE CONTENT:
1. Call list_workspace to see everything available (titles + IDs)
2. Call read_document or read_lecture for the relevant items
3. Call search_lecture to pinpoint exact passages with timestamps
4. Quote directly from the source — use the exact words you read, not paraphrases
5. Mention what you read: "In [item title], it says: '…'"

If the user's open item is already identified below, skip list_workspace and go directly to read_document / read_lecture with that ID.`,
  ]

  const textSelections = contextItems.filter((c) => c.type === "text-selection")
  if (textSelections.length > 0) {
    parts.push(`## TEXT THE USER SELECTED\n${textSelections.map((i) => `> ${i.content}`).join("\n\n")}`)
  }

  const priority = contextItems.filter(
    (c) => c.isPriority && c.type !== "text-selection" && c.type !== "workspace" && c.type !== "image"
  )
  if (priority.length > 0) {
    const hints = priority.map((i) => {
      if (i.type === "lecture") return `Lecture open: "${i.label}" [lecture_id: ${i.id}]`
      if (i.type === "document") return `Document open: "${i.label}" [document_id: ${i.id}]`
      return `Open: "${i.label}" [id: ${i.id}]`
    })
    parts.push(`## CURRENTLY OPEN\n${hints.join("\n")}`)
  }

  const ws = contextItems.filter((c) => c.type === "workspace")
  if (ws.length > 0) {
    parts.push(`## WORKSPACE OVERVIEW\n${ws.map((i) => i.content ?? i.label).join("\n\n")}`)
  }

  return parts.join("\n\n")
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, history, contextItems = [] as ContextItem[], lectureId, attachment } = body
    const attachmentPayload: AttachmentPayload | undefined = attachment

    if (!message && !attachmentPayload) {
      return NextResponse.json({ error: "message is required." }, { status: 400 })
    }

    const supabase = createServiceClient()
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const effectiveItems: ContextItem[] =
      contextItems.length === 0 && lectureId
        ? [{ id: lectureId, type: "lecture", label: "Lecture", isPriority: true }]
        : contextItems

    // Default folder for AI-created docs
    const wsCtx = effectiveItems.find((c) => c.type === "workspace")
    const defaultFolderId = wsCtx?.id.startsWith("workspace-") ? wsCtx.id.slice("workspace-".length) : null

    // Build user content (text + optional attachment)
    type ImageBlock    = { type: "image";    source: { type: "base64"; media_type: string; data: string } }
    type DocumentBlock = { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string }; title?: string }
    type TextBlock     = { type: "text"; text: string }
    type ContentBlock  = ImageBlock | DocumentBlock | TextBlock

    const imageItems = effectiveItems.filter((c) => c.type === "image" && c.imageBase64)
    const extraBlocks: ContentBlock[] = imageItems.map((i): ImageBlock => ({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: i.imageBase64! },
    }))

    if (attachmentPayload) {
      if (attachmentPayload.mimeType === "application/pdf") {
        extraBlocks.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: attachmentPayload.base64 },
          title: attachmentPayload.name,
        })
      } else if (attachmentPayload.mimeType.startsWith("image/")) {
        extraBlocks.push({
          type: "image",
          source: { type: "base64", media_type: attachmentPayload.mimeType, data: attachmentPayload.base64 },
        })
      }
    }

    const messageText =
      message || (attachmentPayload ? `Please analyze this ${attachmentPayload.mimeType.startsWith("image/") ? "image" : "PDF"}: ${attachmentPayload.name}` : "")

    const userContent: ContentBlock[] | string =
      extraBlocks.length > 0 ? [...extraBlocks, { type: "text", text: messageText }] : messageText

    const historyMessages = (history ?? []).slice(-8).map((m: HistoryMsg) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }))

    // Stream setup
    const encoder = new TextEncoder()
    const stream = new TransformStream()
    const writer = stream.writable.getWriter()
    const emit = (event: object) => writer.write(encoder.encode(JSON.stringify(event) + "\n"))

    ;(async () => {
      try {
        const systemPrompt = buildSystemPrompt(effectiveItems)

        type MsgParam = Anthropic.MessageParam
        let loopMessages: MsgParam[] = [
          ...historyMessages,
          { role: "user", content: userContent as Anthropic.MessageParam["content"] },
        ]

        const MAX_ROUNDS = 8
        let assistantTextStarted = false

        for (let round = 0; round < MAX_ROUNDS; round++) {
          const aiStream = anthropic.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            system: systemPrompt,
            messages: loopMessages,
            tools: ALL_TOOLS,
          })

          // Stream text deltas + emit tool_call_start the moment a tool block opens
          for await (const chunk of aiStream) {
            if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
              if (!assistantTextStarted) {
                assistantTextStarted = true
                emit({ text_start: true })
              }
              emit({ text: chunk.delta.text })
            }
            // Emit a pending pill as soon as Claude decides to call a tool
            if (chunk.type === "content_block_start" && chunk.content_block.type === "tool_use") {
              const { id, name } = chunk.content_block
              if (name !== "list_workspace") {
                emit({ tool_call_start: { id, name } })
              }
            }
          }

          const msg = await aiStream.finalMessage()

          if (msg.stop_reason !== "tool_use") break

          // Execute every tool call in this round
          const toolResults: Anthropic.ToolResultBlockParam[] = []

          for (const block of msg.content) {
            if (block.type !== "tool_use") continue

            const input = block.input as Record<string, string>
            let result: string
            let meta: ToolCallRecord

            if (block.name === "list_workspace") {
              const out = await execListWorkspace(supabase)
              result = out.result; meta = out.meta
              // list_workspace is hidden — no done event
            } else if (block.name === "read_document") {
              const out = await execReadDocument(supabase, input.document_id, emit)
              result = out.result; meta = out.meta
              emit({ tool_call_done: { id: block.id, meta } })
            } else if (block.name === "read_lecture") {
              const out = await execReadLecture(supabase, input.lecture_id)
              result = out.result; meta = out.meta
              emit({ tool_call_done: { id: block.id, meta } })
            } else if (block.name === "search_lecture") {
              const out = await execSearchLecture(supabase, input.lecture_id, input.query)
              result = out.result; meta = out.meta
              emit({ tool_call_done: { id: block.id, meta } })
            } else if (block.name === "create_document") {
              meta = { action: "Create", label: input.title || "document", badge: "document" }
              const { data, error } = await supabase
                .from("documents")
                .insert({
                  title: input.title,
                  content: input.content,
                  folder_id: input.folderId ?? defaultFolderId,
                  type: "text",
                })
                .select()
                .single()

              if (error) {
                result = `Error creating document: ${error.message}`
              } else {
                emit({ document_created: { id: data.id, title: data.title } })
                emit({ tool_call_done: { id: block.id, meta } })
                result = `Document created. ID: ${data.id}, title: "${data.title}"`
              }
            } else {
              result = "Unknown tool."
              meta = { action: "Work", label: block.name }
            }

            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result })
          }

          loopMessages = [
            ...loopMessages,
            { role: "assistant", content: msg.content },
            { role: "user", content: toolResults },
          ]
        }

        emit({ done: true })
      } catch (err) {
        emit({ error: err instanceof Error ? err.message : "Unexpected error." })
      } finally {
        try { writer.close() } catch { /* already closed */ }
      }
    })()

    return new Response(stream.readable, {
      headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
    })
  } catch (err) {
    console.error("Chat route error:", err)
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 })
  }
}
