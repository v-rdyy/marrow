import { YoutubeTranscript } from "youtube-transcript"
import ytdl from "@distube/ytdl-core"
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

// Attempt 1: pull YouTube captions (fast, free, no audio needed)
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

// Attempt 2: download audio → OpenAI Whisper transcription
async function transcribeWithWhisper(videoId: string): Promise<TranscriptResult> {
  const url = `https://www.youtube.com/watch?v=${videoId}`

  try {
    const info = await ytdl.getInfo(url)

    // Lowest-bitrate audio-only format — keeps file size minimal
    const audioFormats = ytdl.filterFormats(info.formats, "audioonly")
    if (audioFormats.length === 0) {
      return { ok: false, error: "unavailable", message: "Could not access audio for this video." }
    }
    const format = audioFormats.sort(
      (a, b) => (a.audioBitrate ?? 999) - (b.audioBitrate ?? 999)
    )[0]

    // Buffer the audio stream, capping at 24 MB (Whisper limit is 25 MB)
    // At ~48 kbps this covers ~65 minutes of audio
    const MAX_BYTES = 24 * 1024 * 1024
    const buffers: Buffer[] = []
    let totalBytes = 0

    await new Promise<void>((resolve, reject) => {
      const stream = ytdl.downloadFromInfo(info, { format })
      stream.on("data", (chunk: Buffer) => {
        buffers.push(chunk)
        totalBytes += chunk.length
        if (totalBytes >= MAX_BYTES) {
          stream.destroy()
          resolve()
        }
      })
      stream.on("end", resolve)
      stream.on("error", reject)
    })

    const audioBuffer = Buffer.concat(buffers)
    const ext = format.container ?? "webm"
    const mimeType = (format.mimeType ?? "audio/webm").split(";")[0]

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
    return { ok: true, chunks, rawText, source: "whisper" }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("private") || msg.includes("Private")) {
      return { ok: false, error: "private_video", message: "This video is private." }
    }
    return {
      ok: false,
      error: "unavailable",
      message: "Could not transcribe this video. Make sure it's a public YouTube URL.",
    }
  }
}

// Attempt 2: YouTube innertube API (Android client) — works on cloud IPs where scraping is blocked
async function fetchCaptionsViaInnertube(videoId: string): Promise<TranscriptResult> {
  try {
    const playerRes = await fetch(
      "https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "com.google.android.youtube/17.31.35 (Linux; U; Android 11) gzip",
        },
        body: JSON.stringify({
          context: { client: { clientName: "ANDROID", clientVersion: "17.31.35", androidSdkVersion: 30, hl: "en", gl: "US" } },
          videoId,
        }),
      }
    )
    if (!playerRes.ok) return { ok: false, error: "no_captions", message: "YouTube API unavailable." }

    const playerData = await playerRes.json()
    const status = playerData?.playabilityStatus?.status
    if (status === "LOGIN_REQUIRED") return { ok: false, error: "private_video", message: "This video is private." }
    if (status === "LIVE_STREAM_OFFLINE" || playerData?.videoDetails?.isLive) {
      return { ok: false, error: "livestream", message: "Live streams can't be processed." }
    }

    const tracks: { languageCode: string; kind?: string; baseUrl: string }[] =
      playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
    if (tracks.length === 0) return { ok: false, error: "no_captions", message: "No captions available." }

    // Prefer English auto-generated, then any English, then first available
    const track =
      tracks.find((t) => t.languageCode === "en" && t.kind === "asr") ||
      tracks.find((t) => t.languageCode.startsWith("en")) ||
      tracks[0]

    const captionRes = await fetch(`${track.baseUrl}&fmt=json3`)
    if (!captionRes.ok) return { ok: false, error: "no_captions", message: "Could not fetch caption data." }

    const captionData = await captionRes.json()
    const events: { segs?: { utf8?: string }[]; tStartMs?: number; dDurationMs?: number }[] = captionData.events ?? []

    const rawItems = events
      .filter((e) => e.segs)
      .map((e) => ({
        text: e.segs!.map((s) => s.utf8 ?? "").join("").replace(/\n/g, " ").trim(),
        start: (e.tStartMs ?? 0) / 1000,
        end: ((e.tStartMs ?? 0) + (e.dDurationMs ?? 3000)) / 1000,
      }))
      .filter((item) => item.text.length > 0)

    if (rawItems.length === 0) return { ok: false, error: "no_captions", message: "No caption content." }

    return { ok: true, chunks: buildChunks(rawItems), rawText: rawItems.map((i) => i.text).join(" "), source: "captions" }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("private")) return { ok: false, error: "private_video", message: "This video is private." }
    return { ok: false, error: "no_captions", message: "Could not fetch captions via innertube." }
  }
}

export async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  // Attempt 1: youtube-transcript scraper (fast, works on most IPs)
  const captions = await fetchCaptions(videoId)
  if (captions.ok) return captions
  if (captions.error === "private_video" || captions.error === "livestream") return captions

  // Attempt 2: YouTube innertube API (Android client — works on Vercel IPs)
  console.log(`[ingest] Scraper blocked for ${videoId}, trying innertube`)
  const innertube = await fetchCaptionsViaInnertube(videoId)
  if (innertube.ok) return innertube
  if (innertube.error === "private_video" || innertube.error === "livestream") return innertube

  // Attempt 3: Whisper transcription via audio download
  console.log(`[ingest] Innertube failed for ${videoId}, falling back to Whisper`)
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
