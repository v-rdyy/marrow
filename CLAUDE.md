@AGENTS.md

# Marrow — Project Reference

**What this is:** A ThinkEx-inspired visual workspace for YouTube lecture videos. Students paste a YouTube URL, Marrow's four AI agents extract the essential substance: timestamped outline, multi-depth summaries, flashcards with source citations, semantic search, and a live AI tutor grounded entirely in the lecture. Every claim links back to a timestamp in the video.

**Hackathon:** Cloudforce "No Resume Required" — $5,000 prize + internship seat.
**Deadline:** May 11, 2026 at 11:59 PM ET (submission). Judging window: May 12–15.
**Live URL target:** marrow-app.vercel.app
**Capability:** Building Cap 1 (Student) to be perfect. Cap 2/3 are stretch if time allows.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router + TypeScript |
| Styling | Tailwind CSS + shadcn/ui (new-york) |
| Animation | Framer Motion |
| State | Zustand (`src/stores/`) + TanStack Query |
| Database | Supabase (PostgreSQL + Auth) |
| Auth | Supabase Auth — Google OAuth only |
| LLM | Claude claude-sonnet-4-6 via `@anthropic-ai/sdk` |
| Embeddings | OpenAI `text-embedding-3-small` via `openai` |
| Transcripts | `youtube-transcript` npm package |
| Rate limiting | Upstash Redis + `@upstash/ratelimit` (TODO) |
| Hosting | Vercel Pro (for `maxDuration: 60` on API routes) |

---

## The Four Agents — justification for camera defense

1. **IngestAgent** (`src/lib/agents/ingest-agent.ts`)
   - Job: fetch + validate + chunk the transcript
   - Makes quality judgment calls — rejects inputs that would poison downstream
   - Has zero content generation knowledge; only handles source material
   - Could be swapped for Whisper pipeline without touching anything else

2. **ContentAgent** (`src/lib/agents/content-agent.ts`)
   - Job: pure generation from structured chunks
   - Parallel fan-out: outline + 3-depth summaries + flashcards all run simultaneously
   - Every output item carries `sourceChunkIds` — the claim attribution data model
   - Has no knowledge of YouTube, HTTP, or embeddings

3. **SearchAgent** (`src/lib/agents/search-agent.ts`)
   - Job: stateful retrieval — embeds chunks, answers cosine similarity queries
   - Runs in parallel with ContentAgent during processing
   - Responds to ad-hoc queries at any time after indexing
   - Has no opinion on content quality — it finds, it doesn't judge

4. **TutorAgent** (`src/lib/agents/tutor-agent.ts`)
   - Job: conversational AI grounded in the lecture
   - Calls SearchAgent as a sub-tool (real agent composition)
   - Never answers from training data — must retrieve context first
   - Streams responses with inline source timestamps for UI attribution

**Orchestration narrative:** ContentAgent can only run after IngestAgent succeeds. SearchAgent setup runs in parallel with ContentAgent. TutorAgent depends on SearchAgent's index. ContentAgent's 5 subtasks share chunks but have independent failure boundaries. This is real orchestration, not 3 prompts in a loop.

---

## Central Design: Claim Attribution

**The single most important technical decision.** Every AI-generated claim must link to a source timestamp. This satisfies the judging requirement "lets the user interrogate any claim and see the source moment in the video."

```typescript
// Every piece of AI output carries this structure:
type ClaimedText = { text: string; sourceChunkIds: string[] }
type OutlineNode = { title: string; chunkId: string; timestamp: number; children: OutlineNode[] }
type SummaryParagraph = { text: string; sourceChunkIds: string[] }
type Flashcard = { id: string; question: string; answer: string; sourceChunkId: string; timestamp: number }
```

In the UI: every claim renders a `[MM:SS]` badge. Clicking it calls `youtubePlayer.seekTo(seconds)` via the YouTube IFrame Player API. This must work for outline nodes, summary paragraphs, flashcard answers, and tutor chat responses.

---

## File Structure

```
src/
  app/
    page.tsx                        — home: URL input, Framer Motion
    lecture/[id]/page.tsx           — processing view → lecture view
    api/
      lectures/
        ingest/route.ts             — IngestAgent: validate + chunk
        [id]/route.ts               — GET lecture record
        [id]/stream/route.ts        — SSE pipeline: ContentAgent + SearchAgent parallel
        [id]/content/route.ts       — GET completed content
        [id]/search/route.ts        — SearchAgent query
      chat/route.ts                 — TutorAgent streaming

  lib/
    agents/
      ingest-agent.ts
      content-agent.ts              — generateOutline, generateSummary, generateFlashcards, runContentAgent
      search-agent.ts               — embedChunks, searchChunks
      tutor-agent.ts                — runTutorAgent (async generator, streams)
    supabase/
      client.ts                     — browser client
      server.ts                     — server client + service role client
      middleware.ts                 — session refresh
    youtube/
      extract.ts                    — extractVideoId, fetchTranscript, fetchVideoMetadata
    providers.tsx                   — QueryClientProvider + TooltipProvider

  components/
    processing/
      ProcessingView.tsx            — animated per-agent progress (DONE)
    lecture/
      LectureView.tsx               — stub — NEEDS FULL BUILD (Day 4)
      VideoPlayer.tsx               — YouTube IFrame Player API wrapper (TODO)
      OutlineTab.tsx                — collapsible outline with timestamp badges (TODO)
      SummaryTab.tsx                — 90s/5min/full toggle with inline citations (TODO)
      FlashcardsTab.tsx             — grid with flip animation + source timestamps (TODO)
      SearchTab.tsx                 — semantic search → timestamp results (TODO)
      TranslateSelector.tsx         — language dropdown, per-tab translation (TODO)
      ClaimSource.tsx               — timestamp badge component, seeks video (TODO)
    chat/
      TutorChat.tsx                 — conversational tutor panel (TODO)
      ChatMessage.tsx               — message with inline timestamp badges (TODO)

  stores/
    ui-store.ts                     — Zustand: seekTarget, activeTab, summaryDepth, translation

  types/
    index.ts                        — all domain types (Chunk, ClaimedText, OutlineNode, etc.)

supabase-schema.sql                 — run in Supabase SQL editor to create tables
.env.local.example                  — copy to .env.local and fill in keys
```

---

## Database Tables (Supabase)

- `lectures` — title, video_id, youtube_url, thumbnail_url, processing_status
- `lecture_chunks` — raw chunks from IngestAgent (jsonb)
- `lecture_content` — outline, summaries, flashcards, embeddings (all jsonb)
- `chat_threads` — per lecture
- `chat_messages` — role, content, source_timestamps

Service role key bypasses RLS. All API routes use service role. Client uses anon key.

---

## API Pipeline (processing flow)

```
POST /api/lectures/ingest
  → IngestAgent runs, chunks stored in lecture_chunks
  → Returns { lectureId }

Frontend navigates to /lecture/[id]
  → Connects to GET /api/lectures/[id]/stream (SSE)
  → Stream fires: content_start, then parallel:
      outline_done, flashcards_done, summary_*_done (from ContentAgent)
      embed_start, embed_done (from SearchAgent)
  → Frontend shows each tab as it completes
  → stream fires completed → frontend fetches full content

GET /api/lectures/[id]/search?q=
  → SearchAgent: embed query, cosine sim, return top 5 chunks

POST /api/chat
  → TutorAgent: calls SearchAgent internally, streams NDJSON
```

---

## Environment Variables Needed

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
OPENAI_API_KEY
UPSTASH_REDIS_REST_URL      (rate limiting — TODO)
UPSTASH_REDIS_REST_TOKEN    (rate limiting — TODO)
NEXT_PUBLIC_APP_URL
```

Never use `NEXT_PUBLIC_` prefix for Anthropic, OpenAI, or Supabase service role keys.

---

## Build Status

**Done (scaffold):**
- [x] Next.js 16 + TypeScript + Tailwind + shadcn + Framer Motion installed
- [x] All four agents implemented (IngestAgent, ContentAgent, SearchAgent, TutorAgent)
- [x] All API routes wired (`/ingest`, `/stream`, `/content`, `/search`, `/chat`)
- [x] Supabase client/server setup
- [x] SSE streaming pipeline in `/stream` route
- [x] ProcessingView with per-agent animated progress
- [x] Home page with URL input
- [x] Types, stores, providers
- [x] Supabase schema SQL
- [x] Clean `npm run build` passing

**TODO (in order):**
- [ ] Set up Supabase project + run schema + fill .env.local
- [ ] YouTube IFrame Player API wrapper (`VideoPlayer.tsx`)
- [ ] `ClaimSource.tsx` — timestamp badge that calls `seekTo()`
- [ ] `OutlineTab.tsx` — collapsible tree with timestamp badges
- [ ] `SummaryTab.tsx` — 90s/5min/full with inline citation badges
- [ ] `FlashcardsTab.tsx` — grid + flip + source timestamp badge
- [ ] `SearchTab.tsx` — query input → results with timestamps
- [ ] `TutorChat.tsx` + `ChatMessage.tsx` — grounded streaming chat
- [ ] `TranslateSelector.tsx` + translation API endpoint
- [ ] `LectureView.tsx` — wire all components into the split-pane layout
- [ ] Rate limiting with Upstash (add to `/ingest` and `/chat` routes)
- [ ] Error state pages
- [ ] Auth (Supabase Google OAuth) — optional, add after core UX works
- [ ] Deploy to Vercel + set env vars
- [ ] Test on 10+ real lecture URLs
- [ ] Architecture diagram (Excalidraw → PNG)
- [ ] Defense video recording

---

## Key Decisions Already Made (don't revisit)

- **No Python backend** — everything in Next.js API routes. Single Vercel deployment.
- **No Zero (Rocicorp)** — no real-time collaboration needed. TanStack Query handles server state.
- **No drag-and-drop workspace grid** — cut to protect time for claim attribution quality.
- **No PDF/audio/OCR** — lecture-specific only.
- **Google OAuth only** — no email/password.
- **OpenAI embeddings** (`text-embedding-3-small`) — cheap, reliable, no Python needed.
- **Vercel Pro** — needed for `maxDuration: 60` on long AI calls.
- **Supabase free tier** — PostgreSQL + Auth, no self-hosting.
- **Claim attribution is the central design** — every AI output item carries sourceChunkIds. This is non-negotiable.

---

## Hackathon Submission Checklist

- [ ] Live URL working through May 15 5pm ET
- [ ] Architecture diagram (PNG/PDF) — agents + data flow + deployment
- [ ] Defense video (4-8 min, unlisted YouTube):
  - Part A: Full demo with a real YouTube URL
  - Part B: On camera — tradeoff answer (what you cut, what you polished)
  - Prepared answer: "Cut the workspace grid. Spent that time on claim attribution — every AI output links to a timestamp. That tradeoff is right for a tool whose value is trust."
- [ ] Submitted via Microsoft Form (link shared with registered participants only)
- [ ] Registered before May 6 EOD

---

## Judging Axes — how we score on each

| Axis | What judges look for | Our answer |
|---|---|---|
| Architecture | Real orchestration, observable, secure keys, low latency | 4 agents with distinct jobs, SSE streaming, all keys server-side, progressive tab unlocking |
| Reliability | Works on video 1, 2, 10. Edge cases. | Error states for all failure modes. Test on 10+ videos before submit. |
| Quality | AI output actually holds up | ContentAgent prompt with strict citation discipline. No hallucination. |
| Craft | Motion, hierarchy, restraint | Framer Motion on processing view + tab transitions. shadcn/ui. Nothing gratuitous. |
| Judgment | Tradeoffs. Cap 1 superbly > all three sloppily | Cut grid, cut Cap 2/3, doubled down on claim attribution. |

---

## ThinkEx UI Implementation Plan

### Color System (globals.css)
Current dark palette is correct: `--background: oklch(0.17 0 0)`, `--card: oklch(0.21 0 0)` (elevated), `--sidebar: oklch(0.13 0 0)`. No changes needed.

### Grid Layout (WorkspaceGrid.tsx)
- Grid: `grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-6` (was minmax 200px gap-5)
- Container: `px-4 py-6 sm:px-6` (was `p-6`)

### FolderCard (two-part tab+body design — ThinkEx signature)
- Outer: `relative aspect-[4/3] cursor-pointer` (motion wraps this)
- Tab piece: `absolute left-0 top-0 h-[10%] w-[35%] rounded-t-md border border-border bg-card`
- Body piece: `absolute bottom-0 left-0 right-0 top-[10%] rounded-md rounded-tl-none border border-border bg-card shadow-sm group-hover:border-foreground/30 group-hover:shadow-md`
- Inside body: folder icon (left-aligned), name + count at bottom

### LectureCard + DocumentCard (ThinkEx WorkspaceCard style)
- Remove `rounded-xl`, replace with `rounded-md border shadow-sm hover:border-foreground/30 hover:shadow-md`
- Keep `aspect-[4/3]`, keep thumbnail/icon layout
- Transition: `transition-all duration-200`

### WorkspaceSidebar
- Width: `w-64` (16rem) expanded, `w-12` (3rem) collapsed — was w-52

### Header (page.tsx)
- Add `bg-sidebar` to header
- "New" button: keep as-is (already white on dark)

### LectureView.tsx
- Panel defaults: left 28%, center 40%, right 32% (shift slightly toward chat)
- ChatPanel right border: no change

### ChatPanel.tsx
- Outer div: add `bg-sidebar` class
- Messages area: add gradient fade overlay `pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-gradient-to-b from-sidebar/80 to-transparent`
- Make messages area wrapper `relative`

---

## Notes / Gotchas

- `youtube-transcript` is scraping-based, not official API. Test from deployed Vercel URL (not just localhost) — YouTube may block Vercel IPs.
- YouTube IFrame Player API requires loading `https://www.youtube.com/iframe_api` script. A plain `<iframe>` cannot be controlled from JS. Use `window.YT.Player` and `seekTo()`.
- Supabase on Vercel: use the **pooler** connection URL, not the direct URL. Find it in Supabase project settings → Database → Connection pooling.
- `maxDuration: 60` must be exported from route files that run long AI calls.
- Never put API keys in `NEXT_PUBLIC_` env vars.
- All content must render with `sourceChunkIds` — if a prompt returns content without them, the prompt needs fixing before moving on.
- The `middleware.ts` file convention is deprecated in Next.js 16 — it should be `proxy.ts`. The build warning is benign for now but needs fixing before final deploy.

