import { YoutubeTranscript } from "youtube-transcript"
import { Innertube } from "youtubei.js"
import OpenAI, { toFile } from "openai"
import type { Chunk } from "@/types"

export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

export type TranscriptError =
  | "private_video"
  | "no_captions"
  | "livestream"
  | "unavailable"
  | "too_short"

export type TranscriptResult =
  | { ok: true; chunks: Chunk[]; rawText: string; source: "captions" | "whisper" }
  | { ok: false; error: TranscriptError; message: string }

// Shared chunking logic — merges raw text items into ~1200-char segments with timestamps
function buildChunks(items: { text: string; start: number; end: number }[]): Chunk[] {
  const chunks: Chunk[] = []
  let buffer = ""
  let chunkStart = items[0].start
  let chunkIdx = 0

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    buffer += (buffer ? " " : "") + item.text.trim()
    const isLast = i === items.length - 1

    if (buffer.length >= 1200 || isLast) {
      const chunkEnd = isLast ? item.end : (items[i + 1]?.start ?? item.end)
      chunks.push({
        id: `chunk_${String(chunkIdx).padStart(3, "0")}`,
        start: Math.round(chunkStart),
        end: Math.round(chunkEnd),
        text: buffer,
      })
      chunkIdx++
      buffer = ""
      if (!isLast) chunkStart = items[i + 1].start
    }
  }
  return chunks
}

// Attempt 1: pull YouTube captions via simple scraper (fast, works on most IPs / local)
async function fetchCaptions(videoId: string): Promise<TranscriptResult> {
  try {
    const rawItems = await YoutubeTranscript.fetchTranscript(videoId)
    if (!rawItems || rawItems.length === 0) {
      return { ok: false, error: "no_captions", message: "No captions found." }
    }

    const items = rawItems.map((r) => ({
      text: r.text,
      start: r.offset / 1000,
      end: (r.offset + (r.duration ?? 3000)) / 1000,
    }))

    const chunks = buildChunks(items)
    const rawText = rawItems.map((r) => r.text).join(" ")
    return { ok: true, chunks, rawText, source: "captions" }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("private") || msg.includes("Private")) {
      return { ok: false, error: "private_video", message: "This video is private." }
    }
    if (msg.includes("live") || msg.includes("Live")) {
      return { ok: false, error: "livestream", message: "Live streams can't be processed." }
    }
    return { ok: false, error: "no_captions", message: "No captions found." }
  }
}

// Attempt 2: youtubei.js — generates proper visitor_data + po_token so YouTube
// serves captions even from data-center IPs (Vercel, AWS, etc.)
async function fetchCaptionsViaYoutubeJS(videoId: string): Promise<TranscriptResult> {
  try {
    console.log(`[ingest] Trying youtubei.js for ${videoId}`)
    const yt = await Innertube.create({ generate_session_locally: true, retrieve_player: false })
    const info = await yt.getInfo(videoId)

    const status = info.playability_status?.status
    if (status === "LOGIN_REQUIRED") {
      return { ok: false, error: "private_video", message: "This video is private." }
    }
    if (status === "LIVE_STREAM_OFFLINE" || info.basic_info?.is_live) {
      return { ok: false, error: "livestream", message: "Live streams can't be processed." }
    }

    // Try the built-in transcript panel first
    try {
      const transcriptData = await info.getTranscript()
      type Seg = { snippet?: { text?: string }; start_ms?: number; end_ms?: number }
      const segments: Seg[] =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (transcriptData as any)?.transcript?.content?.body?.initial_segments ?? []

      const rawItems = segments
        .filter((s) => s.snippet?.text && s.start_ms != null)
        .map((s) => ({
          text: (s.snippet!.text as string).replace(/\n/g, " ").trim(),
          start: (s.start_ms ?? 0) / 1000,
          end: (s.end_ms ?? 0) / 1000,
        }))
        .filter((i) => i.text.length > 0)

      if (rawItems.length > 0) {
        console.log(`[ingest] youtubei.js transcript panel succeeded`)
        return {
          ok: true,
          chunks: buildChunks(rawItems),
          rawText: rawItems.map((i) => i.text).join(" "),
          source: "captions",
        }
      }
    } catch (transcriptErr) {
      console.log(`[ingest] youtubei.js transcript panel failed: ${transcriptErr}`)
    }

    // Fall back to caption tracks from the player data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const captionTracks: { languageCode?: string; kind?: string; baseUrl?: string }[] =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (info as any)?.captions?.caption_tracks ?? []

    const track =
      captionTracks.find((t) => t.languageCode === "en" && t.kind === "asr") ||
      captionTracks.find((t) => t.languageCode?.startsWith("en")) ||
      captionTracks[0]

    if (!track?.baseUrl) {
      return { ok: false, error: "no_captions", message: "No caption tracks available." }
    }

    const captionRes = await fetch(`${track.baseUrl}&fmt=json3`, {
      headers: { "Accept-Language": "en-US,en;q=0.9" },
    })
    if (!captionRes.ok) return { ok: false, error: "no_captions", message: "Caption fetch failed." }

    const captionData = await captionRes.json()
    const events: { segs?: { utf8?: string }[]; tStartMs?: number; dDurationMs?: number }[] =
      captionData.events ?? []

    const rawItems = events
      .filter((e) => e.segs)
      .map((e) => ({
        text: e.segs!.map((s) => s.utf8 ?? "").join("").replace(/\n/g, " ").trim(),
        start: (e.tStartMs ?? 0) / 1000,
        end: ((e.tStartMs ?? 0) + (e.dDurationMs ?? 3000)) / 1000,
      }))
      .filter((item) => item.text.length > 0)

    if (rawItems.length === 0) return { ok: false, error: "no_captions", message: "No caption content." }

    console.log(`[ingest] youtubei.js caption tracks succeeded`)
    return {
      ok: true,
      chunks: buildChunks(rawItems),
      rawText: rawItems.map((i) => i.text).join(" "),
      source: "captions",
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`[ingest] youtubei.js error: ${msg}`)
    // Don't infer private_video from a ytbjs error — it might just be a network block
    return { ok: false, error: "no_captions", message: "Could not fetch captions via youtubei.js." }
  }
}

// Attempt 3: Whisper transcription — youtubei.js fetches the audio URL (handles cipher),
// we stream the audio bytes to OpenAI Whisper
async function transcribeWithWhisper(videoId: string): Promise<TranscriptResult> {
  try {
    console.log(`[ingest] Trying Whisper for ${videoId}`)
    const yt = await Innertube.create({ generate_session_locally: true, retrieve_player: true })
    const info = await yt.getInfo(videoId)

    const status = info.playability_status?.status
    if (status === "LOGIN_REQUIRED") {
      return { ok: false, error: "private_video", message: "This video is private." }
    }
    if (status === "LIVE_STREAM_OFFLINE" || info.basic_info?.is_live) {
      return { ok: false, error: "livestream", message: "Live streams can't be processed." }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adaptiveFormats: any[] = info.streaming_data?.adaptive_formats ?? []
    const audioFormats = adaptiveFormats.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (f: any) => f.has_audio && !f.has_video
    )
    if (audioFormats.length === 0) {
      return { ok: false, error: "unavailable", message: "No audio format available." }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const format = audioFormats.sort((a: any, b: any) => (a.bitrate ?? 999) - (b.bitrate ?? 999))[0]

    // Decipher the URL using youtubei.js player (handles YouTube's obfuscated cipher)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const audioUrl: string = format.decipher((yt as any).session.player)

    const MAX_BYTES = 24 * 1024 * 1024
    const audioRes = await fetch(audioUrl, {
      headers: { Range: `bytes=0-${MAX_BYTES - 1}` },
    })
    if (!audioRes.ok) {
      return { ok: false, error: "unavailable", message: "Could not download audio." }
    }

    const audioBuffer = Buffer.from(await audioRes.arrayBuffer())
    const ext = (format.mime_type as string | undefined)?.includes("webm") ? "webm" : "mp4"
    const mimeType = ((format.mime_type as string | undefined) ?? "audio/webm").split(";")[0]

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const response = await openai.audio.transcriptions.create({
      file: await toFile(audioBuffer, `audio.${ext}`, { type: mimeType }),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    })

    const segments = (response as { segments?: { text: string; start: number; end: number }[] }).segments ?? []
    if (segments.length === 0) {
      return { ok: false, error: "unavailable", message: "Whisper returned no transcription." }
    }

    const chunks = buildChunks(segments)
    const rawText = segments.map((s) => s.text).join(" ")
    console.log(`[ingest] Whisper succeeded for ${videoId}`)
    return { ok: true, chunks, rawText, source: "whisper" }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`[ingest] Whisper error: ${msg}`)
    return {
      ok: false,
      error: "unavailable",
      message: "Could not transcribe this video. Make sure it's a public YouTube URL.",
    }
  }
}

export async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  // Attempt 1: simple scraper (fast, works on residential/localhost IPs)
  const captions = await fetchCaptions(videoId)
  if (captions.ok) return captions
  if (captions.error === "private_video" || captions.error === "livestream") return captions

  // Attempt 2: youtubei.js — generates proper auth tokens for data-center IPs (Vercel)
  console.log(`[ingest] Scraper failed for ${videoId}, trying youtubei.js`)
  const yjsResult = await fetchCaptionsViaYoutubeJS(videoId)
  if (yjsResult.ok) return yjsResult
  if (yjsResult.error === "private_video" || yjsResult.error === "livestream") return yjsResult

  // Attempt 3: Whisper — audio download via youtubei.js + OpenAI transcription
  console.log(`[ingest] youtubei.js captions failed for ${videoId}, trying Whisper`)
  return transcribeWithWhisper(videoId)
}

export async function fetchVideoMetadata(videoId: string): Promise<{
  title: string
  thumbnailUrl: string
  channelName: string
  durationSeconds: number
} | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    )
    if (!res.ok) return null
    const data = await res.json()
    return {
      title: data.title ?? "Untitled Lecture",
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      channelName: data.author_name ?? "Unknown",
      durationSeconds: 0,
    }
  } catch {
    return null
  }
}
