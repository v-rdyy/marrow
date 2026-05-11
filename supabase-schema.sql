-- Marrow — Supabase schema
-- Safe to re-run: drops everything first then rebuilds

-- Drop tables (cascades to policies, indexes, etc.)
drop table if exists chat_messages cascade;
drop table if exists chat_threads cascade;
drop table if exists lecture_content cascade;
drop table if exists lecture_chunks cascade;
drop table if exists documents cascade;
drop table if exists lectures cascade;
drop table if exists folders cascade;

-- Folders (workspaces at root, sub-folders inside workspaces)
create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references folders(id) on delete cascade,  -- null = root workspace
  name text not null,
  color text not null default 'default',
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- Lectures table
create table if not exists lectures (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references folders(id) on delete set null,
  title text not null default 'Untitled Lecture',
  youtube_url text not null,
  video_id text not null,
  thumbnail_url text,
  channel_name text,
  duration_seconds integer default 0,
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- Documents (rich text notes or PDF uploads)
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references folders(id) on delete set null,
  title text not null default 'Untitled',
  content text not null default '',
  type text not null default 'text' check (type in ('text', 'pdf')),
  file_url text,          -- Supabase storage public URL for PDFs
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Stores raw transcript chunks from IngestAgent
create table if not exists lecture_chunks (
  lecture_id uuid primary key references lectures(id) on delete cascade,
  chunks jsonb not null default '[]',
  created_at timestamptz default now()
);

-- Stores all generated content from ContentAgent + SearchAgent embeddings
create table if not exists lecture_content (
  lecture_id uuid primary key references lectures(id) on delete cascade,
  chunks jsonb default '[]',
  outline jsonb default '[]',
  summary_90s jsonb default '[]',
  summary_5min jsonb default '[]',
  summary_full jsonb default '[]',
  flashcards jsonb default '[]',
  embeddings jsonb default '[]',
  lecture_notes text,                     -- detailed timestamped notes for AI tutor
  chunk_descriptions jsonb default '{}',  -- chunkId → one-line description for search previews
  updated_at timestamptz default now()
);

-- Chat threads per lecture
create table if not exists chat_threads (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid references lectures(id) on delete cascade,
  title text,
  created_at timestamptz default now()
);

-- Chat messages
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references chat_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  source_timestamps jsonb default '[]',
  created_at timestamptz default now()
);

-- Enable RLS (open policies for demo — no auth)
alter table folders enable row level security;
alter table lectures enable row level security;
alter table documents enable row level security;
alter table lecture_chunks enable row level security;
alter table lecture_content enable row level security;
alter table chat_threads enable row level security;
alter table chat_messages enable row level security;

-- Drop old policies
drop policy if exists "folders: all" on folders;
drop policy if exists "lectures: owner access" on lectures;
drop policy if exists "lectures: all" on lectures;
drop policy if exists "documents: all" on documents;
drop policy if exists "lecture_chunks: owner access" on lecture_chunks;
drop policy if exists "lecture_chunks: all" on lecture_chunks;
drop policy if exists "lecture_content: owner access" on lecture_content;
drop policy if exists "lecture_content: all" on lecture_content;
drop policy if exists "chat_threads: owner access" on chat_threads;
drop policy if exists "chat_threads: all" on chat_threads;
drop policy if exists "chat_messages: owner access" on chat_messages;
drop policy if exists "chat_messages: all" on chat_messages;

-- Open policies (service role bypasses; anon key reads for demo)
create policy "folders: all" on folders for all using (true);
create policy "lectures: all" on lectures for all using (true);
create policy "documents: all" on documents for all using (true);
create policy "lecture_chunks: all" on lecture_chunks for all using (true);
create policy "lecture_content: all" on lecture_content for all using (true);
create policy "chat_threads: all" on chat_threads for all using (true);
create policy "chat_messages: all" on chat_messages for all using (true);

-- NOTE: For PDF upload support, create a public storage bucket named "pdfs" in Supabase dashboard
-- Storage → New bucket → Name: pdfs → Public: ON
