import ytdl from "@distube/ytdl-core"
import Anthropic from "@anthropic-ai/sdk"

interface StoryboardSheet {
  url: string
  startSeconds: number
  endSeconds: number
}

interface StoryboardSpec {
  urlTemplate: string
  sheetCount: number
  cols: number
  rows: number
  frameWidth: number
  frameHeight: number
  intervalMs: number
}

// Parse YouTube's storyboard spec string to extract sheet metadata and URL template
function parseStoryboardSpec(rawSpec: string): StoryboardSpec | null {
  try {
    // Spec format: URL_TEMPLATE|SHEET_COUNT|W|H|COLS|ROWS|INTERVAL_MS|SIGH
    // URL_TEMPLATE contains $N for sheet index
    const parts = rawSpec.split("|")
    if (parts.length < 7) return null

    const urlTemplate = parts[0].replace(/\$L\d*/, "2") // use level 2 (highest quality)
    const sheetCount = parseInt(parts[1]) || 1
    const frameWidth = parseInt(parts[2]) || 160
    const frameHeight = parseInt(parts[3]) || 90
    const cols = parseInt(parts[4]) || 5
    const rows = parseInt(parts[5]) || 5
    const intervalMs = parseInt(parts[6]) || 5000

    if (!urlTemplate.includes("$N")) return null
    return { urlTemplate, sheetCount, cols, rows, frameWidth, frameHeight, intervalMs }
  } catch {
    return null
  }
}

function buildSheetUrl(template: string, sheetIndex: number): string {
  return template.replace(/\$N/, String(sheetIndex))
}

// Pick up to maxSheets sheets evenly distributed across the video
function selectSheets(spec: StoryboardSpec, maxSheets: number): StoryboardSheet[] {
  const framesPerSheet = spec.cols * spec.rows
  const sheetDurationMs = framesPerSheet * spec.intervalMs
  const sheetDurationSec = sheetDurationMs / 1000

  const count = Math.min(maxSheets, spec.sheetCount)
  const step = Math.max(1, Math.floor(spec.sheetCount / count))
  const sheets: StoryboardSheet[] = []

  for (let i = 0; i < spec.sheetCount && sheets.length < count; i += step) {
    sheets.push({
      url: buildSheetUrl(spec.urlTemplate, i),
      startSeconds: Math.round((i * sheetDurationMs) / 1000),
      endSeconds: Math.round(((i + 1) * sheetDurationMs) / 1000),
    })
  }
  return sheets
}

async function downloadSheetAsBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const contentType = res.headers.get("content-type") ?? "image/jpeg"
    const mimeType = contentType.split(";")[0]
    const buffer = Buffer.from(await res.arrayBuffer())
    return { base64: buffer.toString("base64"), mimeType }
  } catch {
    return null
  }
}

export interface VisualSegment {
  startSeconds: number
  endSeconds: number
  // Text/content extracted from on-screen visuals (slides, whiteboards, code)
  extractedText: string
}

// Extract on-screen content from YouTube storyboard frames using Claude vision.
// Returns timestamped descriptions of visual content (slides, equations, diagrams, code).
// Gracefully returns [] if storyboards are unavailable or vision extraction fails.
export async function extractVisualContent(videoId: string): Promise<VisualSegment[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return []

  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`
    const info = await ytdl.getInfo(url)

    // Get storyboard spec from player response
    const specRaw: string | undefined =
      (info as any).player_response?.storyboards?.playerStoryboardSpecRenderer?.spec

    if (!specRaw) return []

    // YouTube returns multiple specs separated by newlines or #; pick the last (highest quality)
    const specLines = specRaw.split(/[#\n]/).filter(Boolean)
    const spec = parseStoryboardSpec(specLines[specLines.length - 1])
    if (!spec) return []

    // Sample up to 8 sheets spread across the video
    const sheets = selectSheets(spec, 8)
    if (sheets.length === 0) return []

    // Download sheets in parallel (skip failures)
    const downloaded = await Promise.all(
      sheets.map(async (sheet) => {
        const img = await downloadSheetAsBase64(sheet.url)
        return img ? { ...sheet, ...img } : null
      })
    )
    const valid = downloaded.filter(Boolean) as (StoryboardSheet & { base64: string; mimeType: string })[]
    if (valid.length === 0) return []

    // Send all sheets in one Claude vision call to keep latency low
    const anthropic = new Anthropic({ apiKey })
    const imageContent: Anthropic.ImageBlockParam[] = valid.map((s) => ({
      type: "image",
      source: { type: "base64", media_type: s.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: s.base64 },
    }))
    const labelContent: Anthropic.TextBlockParam = {
      type: "text",
      text: valid.map((s, i) => `Image ${i + 1}: ${formatTime(s.startSeconds)}–${formatTime(s.endSeconds)}`).join("\n") +
        "\n\nFor each storyboard sheet above, extract ALL visible on-screen content: slide text, equations, code snippets, diagram labels, and whiteboard writing. Return JSON array:\n[{\"sheet\":1,\"content\":\"...\"},{\"sheet\":2,\"content\":\"...\"}]\nIf a sheet shows only a talking head with no readable content, use \"content\":\"\". Keep each content string under 500 chars.",
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: [...imageContent, labelContent] }],
    })

    const text = response.content[0].type === "text" ? response.content[0].text : ""
    const cleaned = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim()
    const parsed: Array<{ sheet: number; content: string }> = JSON.parse(cleaned)

    return parsed
      .filter((p) => p.content && p.content.trim())
      .map((p) => {
        const sheet = valid[p.sheet - 1]
        if (!sheet) return null
        return { startSeconds: sheet.startSeconds, endSeconds: sheet.endSeconds, extractedText: p.content.trim() }
      })
      .filter(Boolean) as VisualSegment[]
  } catch (err) {
    console.warn("[visual] storyboard extraction failed:", err instanceof Error ? err.message : String(err))
    return []
  }
}

// Merge visual segments into existing transcript chunks by annotating chunks that
// fall within a visual segment's time range.
export function mergeVisualIntoChunks(
  chunks: import("@/types").Chunk[],
  visuals: VisualSegment[]
): import("@/types").Chunk[] {
  if (visuals.length === 0) return chunks
  return chunks.map((chunk) => {
    const matching = visuals.find(
      (v) => v.startSeconds <= chunk.end && v.endSeconds >= chunk.start
    )
    if (!matching) return chunk
    return { ...chunk, text: chunk.text + `\n[ON-SCREEN: ${matching.extractedText}]` }
  })
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}
