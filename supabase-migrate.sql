-- Marrow — additive migration (run this if you already have the tables)
-- Adds parent_id to folders and type/file_url to documents

alter table folders add column if not exists parent_id uuid references folders(id) on delete cascade;

alter table documents add column if not exists type text not null default 'text' check (type in ('text', 'pdf'));
alter table documents add column if not exists file_url text;

-- Add color column for ThinkEx-style vivid card colors
alter table lectures   add column if not exists color text;
alter table documents  add column if not exists color text;

-- Verify
select column_name from information_schema.columns where table_name = 'folders' and column_name = 'parent_id';
select column_name from information_schema.columns where table_name = 'documents' and column_name = 'type';
select column_name from information_schema.columns where table_name = 'lectures'  and column_name = 'color';
select column_name from information_schema.columns where table_name = 'documents' and column_name = 'color';
