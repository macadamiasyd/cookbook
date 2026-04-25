-- Enable trigram extension for fuzzy search
create extension if not exists pg_trgm;

-- Recipe index table
create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  recipe_title text not null,
  page_number integer,
  category text,
  source text not null default 'index_ocr' check (source in ('index_ocr', 'manual', 'claude_seeded')),
  created_at timestamptz default now()
);

create index if not exists recipes_book_id_idx on recipes(book_id);
create index if not exists recipes_title_trgm_idx on recipes using gin (recipe_title gin_trgm_ops);
create index if not exists recipes_title_fts_idx on recipes using gin (to_tsvector('english', recipe_title));

-- Add ingestion tracking columns to books
alter table books add column if not exists index_ingested_at timestamptz;
alter table books add column if not exists recipe_count integer default 0;
alter table books add column if not exists ingestion_method text
  check (ingestion_method in ('index_ocr', 'manual', 'claude_seeded', 'pending'))
  default 'pending';
