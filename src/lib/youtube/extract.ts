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

type InnertubeClient = {
  clientName: string
  clientId: string
  clientVersion: string
  apiKey: string
  userAgent: string
  extra?: Record<string, unknown>
}

const INNERTUBE_CLIENTS: InnertubeClient[] = [
  {
    clientName: "IOS",
    clientId: "5",
    clientVersion: "19.45.4",
    apiKey: "AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc",
    userAgent: "com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X)",
    extra: { deviceModel: "iPhone16,2", utcOffsetMinutes: 0 },
  },
  {
    clientName: "ANDROID",
    clientId: "3",
    clientVersion: "17.31.35",
    apiKey: "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
    userAgent: "com.google.android.youtube/17.31.35 (Linux; U; Android 11) gzip",
    extra: { androidSdkVersion: 30 },
  },
  {
    clientName: "TVHTML5",
    clientId: "7",
    clientVersion: "7.20241201.18.00",
    apiKey: "AIzaSyDCU8hByM-4DrUqRUYnGn-3llEO78bcxq8",
    userAgent: "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.5 TV Safari/538.1",
  },
]

async function captionsFromPlayerData(
  playerData: Record<string, unknown>
): Promise<TranscriptResult | null> {
  const status = (playerData?.playabilityStatus as { status?: string })?.status
  if (status === "LOGIN_REQUIRED") return { ok: false, error: "private_video", message: "This video is private." }
  if (
    status === "LIVE_STREAM_OFFLINE" ||
    (playerData?.videoDetails as { isLive?: boolean })?.isLive
  ) {
    return { ok: false, error: "livestream", message: "Live streams can't be processed." }
  }

  const tracks = (
    (playerData?.captions as { playerCaptionsTracklistRenderer?: { captionTracks?: { languageCode: string; kind?: string; baseUrl: string }[] } })
      ?.playerCaptionsTracklistRenderer?.captionTracks ?? []
  )
  if (tracks.length === 0) return null

  const track =
    tracks.find((t) => t.languageCode === "en" && t.kind === "asr") ||
    tracks.find((t) => t.languageCode.startsWith("en")) ||
    tracks[0]

  const captionRes = await fetch(`${track.baseUrl}&fmt=json3`, {
    headers: { "Accept-Language": "en-US,en;q=0.9" },
  })
  if (!captionRes.ok) return null

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

  if (rawItems.length === 0) return null
  return { ok: true, chunks: buildChunks(rawItems), rawText: rawItems.map((i) => i.text).join(" "), source: "captions" }
}

// Attempt 2: YouTube innertube API — tries iOS, Android, TV clients in sequence
async function fetchCaptionsViaInnertube(videoId: string): Promise<TranscriptResult> {
  for (const client of INNERTUBE_CLIENTS) {
    try {
      console.log(`[ingest] Trying innertube ${client.clientName} for ${videoId}`)
      const playerRes = await fetch(
        `https://www.youtube.com/youtubei/v1/player?key=${client.apiKey}&prettyPrint=false`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": client.userAgent,
            "X-Youtube-Client-Name": client.clientId,
            "X-Youtube-Client-Version": client.clientVersion,
            "Origin": "https://www.youtube.com",
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: client.clientName,
                clientVersion: client.clientVersion,
                hl: "en",
                gl: "US",
                ...(client.extra ?? {}),
              },
            },
            videoId,
          }),
        }
      )
      if (!playerRes.ok) {
        console.log(`[ingest] ${client.clientName} HTTP ${playerRes.status}`)
        continue
      }

      const playerData = await playerRes.json()
      const result = await captionsFromPlayerData(playerData)
      if (result?.ok === false && (result.error === "private_video" || result.error === "livestream")) {
        return result
      }
      if (result?.ok) {
        console.log(`[ingest] ${client.clientName} succeeded`)
        return result
      }
      // null or no captions — try next client
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("private")) return { ok: false, error: "private_video", message: "This video is private." }
      console.log(`[ingest] ${client.clientName} threw: ${msg}`)
    }
  }
  return { ok: false, error: "no_captions", message: "No captions found via innertube." }
}

// Attempt 3: parse ytInitialPlayerResponse from the watch page HTML
async function fetchCaptionsFromWatchPage(videoId: string): Promise<TranscriptResult> {
  try {
    console.log(`[ingest] Trying watch-page HTML scrape for ${videoId}`)
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    })
    if (!res.ok) return { ok: false, error: "no_captions", message: "Watch page unavailable." }

    const html = await res.text()
    const match = html.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var |<\/script>)/)
    if (!match) return { ok: false, error: "no_captions", message: "Could not parse watch page." }

    const playerData: Record<string, unknown> = JSON.parse(match[1])
    const result = await captionsFromPlayerData(playerData)
    if (result) return result
    return { ok: false, error: "no_captions", message: "No captions on watch page." }
  } catch {
    return { ok: false, error: "no_captions", message: "Watch page scrape failed." }
  }
}

export async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  // Attempt 1: youtube-transcript scraper (fast, works on most IPs)
  const captions = await fetchCaptions(videoId)
  if (captions.ok) return captions
  if (captions.error === "private_video" || captions.error === "livestream") return captions

  // Attempt 2: innertube API — tries iOS, Android, TV clients
  console.log(`[ingest] Scraper blocked for ${videoId}, trying innertube`)
  const innertube = await fetchCaptionsViaInnertube(videoId)
  if (innertube.ok) return innertube
  if (innertube.error === "private_video" || innertube.error === "livestream") return innertube

  // Attempt 3: watch-page HTML scrape (different network path from API endpoints)
  console.log(`[ingest] Innertube failed for ${videoId}, trying watch page`)
  const watchPage = await fetchCaptionsFromWatchPage(videoId)
  if (watchPage.ok) return watchPage
  if (watchPage.error === "private_video" || watchPage.error === "livestream") return watchPage

  // Attempt 4: Whisper transcription via audio download
  console.log(`[ingest] Watch page failed for ${videoId}, falling back to Whisper`)
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
