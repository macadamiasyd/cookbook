create table books (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  author text not null,
  year integer,
  isbn text,
  cover_url text,
  publisher text,
  notes text,
  created_at timestamptz default now()
);

create index books_slug_idx on books(slug);
