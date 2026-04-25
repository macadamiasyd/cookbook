# Cookbook Search — Claude Code Build Spec

## Project overview

A personal web app that searches a cookbook collection using Claude's knowledge of published cookbooks. The user enters a query (ingredient, dish, mood) and gets back a list of matching recipes with book cover, recipe title, and approximate page number.

This spec extends an existing prototype (Next.js 14 + hardcoded JSON, currently running locally) and migrates it to a full Supabase-backed deployment on Vercel with collection management.

## Current state

The starting codebase is a working Next.js 14 prototype with:
- `data/books.json` — 44 hardcoded books with id, title, author, year, cover URL
- `app/api/search/route.ts` — server-side Claude API call that takes a query, returns ranked recipe matches with confidence levels
- `app/page.tsx` — single search page with input, suggestion chips, and result list
- Tailwind for styling, TypeScript throughout

The build spec below is what to add and change. Preserve the working search behaviour.

## Goals (this build)

1. Move book collection from `data/books.json` to Supabase
2. Replace single-page UI with a multi-route app (collection grid + dedicated search page)
3. Add "Add a book" flow: manual entry + ISBN lookup via Google Books API
4. Show cover thumbnails alongside search results
5. Deploy to Vercel as a personal site (single-user, no auth — see "Deployment notes")

## Stack

- Next.js 14 App Router, TypeScript (already in place)
- Tailwind CSS (already in place)
- Supabase (Postgres, accessed via `@supabase/supabase-js`)
- Anthropic SDK (already in place)
- Google Books API for ISBN lookup (no key required, public endpoint)
- Vercel for hosting

## Database schema (Supabase)

One table for now — keep it simple, extend later if needed.

```sql
create table books (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,           -- url-safe id used in search prompt (e.g. "ottolenghi-simple")
  title text not null,
  author text not null,
  year integer,
  isbn text,
  cover_url text,
  publisher text,
  notes text,                          -- user notes (e.g. "borrowed from Mum")
  created_at timestamptz default now()
);

create index books_slug_idx on books(slug);
```

For the initial migration, seed this table from the existing `data/books.json`. Generate UUIDs via Supabase, but keep the existing slugs as the `slug` column so any in-flight searches don't break.

Optional follow-up table (do NOT build yet, just leave room for it):
- `recipe_feedback` — user-confirmed page numbers / corrections to feed back into the search prompt over time.

## Routes / pages

```
/                       Collection grid — landing page
/search                 Search page (main feature)
/books/new              Add a book (form + ISBN lookup)
/books/[slug]           Book detail — cover, metadata, "search recipes from this book" button
                        (later: list of saved recipe searches for this book)

API routes:
/api/search             POST { query } — existing route, now reads from Supabase
/api/books              GET (list), POST (create)
/api/books/[id]         PATCH (edit), DELETE
/api/lookup-isbn        GET ?isbn=... — proxy to Google Books API, normalises result
```

## Page specifications

### / — Collection grid (landing page)

- Header: "Cookbook Search" title, book count ("44 books"), prominent "Add a book" button top right
- Primary action: large search input centred near the top, full width on mobile, ~60% on desktop. Submitting navigates to `/search?q=...` with results pre-loaded.
- Below: responsive grid of book covers, 6 columns on desktop, 4 on tablet, 2 on mobile. Each cover ~120px wide with `aspect-ratio: 2/3`.
- Each cover is a link to `/books/[slug]`. Hover shows title + author tooltip overlay.
- Books missing covers: render a neutral card with the title typeset cleanly (think Penguin classics — solid colour bg, serif title text).
- Sort: newest-added first by default. Add a small dropdown for sort options (alphabetical, by author, by year).
- Empty state: "No books yet — add your first cookbook" with a button to `/books/new`.

### /search — Search page

- Same input as the home page but persistent at the top of the search page
- URL is the source of truth: `/search?q=eggplant` runs the search on load. Updating the input updates the URL via `router.replace` (no full nav).
- Suggestion chips below the input (same set as current prototype)
- Results list: each item shows a **48×72px cover thumbnail**, recipe title, book title + author, confidence badge (only when not "high"), and page number badge on the right
- Empty state, loading state, error state — same patterns as current prototype
- Each result row links to `/books/[slug]` when the cover or book title is clicked

### /books/new — Add a book

Two paths in one form, switchable via tabs or radio buttons at the top:

**Path 1: ISBN lookup**
- Input: ISBN-10 or ISBN-13 (strip hyphens/spaces before lookup)
- "Lookup" button → calls `/api/lookup-isbn?isbn=...`
- On success: pre-fills the form fields below (title, author, year, cover URL, publisher) so the user can review and edit before saving
- On failure: shows error inline, leaves user on manual-entry path

**Path 2: Manual entry**
- Fields: title (required), author (required), year, cover URL, publisher, notes
- Slug is auto-generated from `title-author` (lowercased, hyphenated, deduplicated against existing slugs by appending `-2`, `-3` if needed)
- "Save" button → POST to `/api/books`, on success redirect to `/books/[slug]`
- "Cancel" → back to `/`

Validation: title and author required. Show friendly errors inline.

### /books/[slug] — Book detail

- Large cover on the left (or top on mobile), metadata on the right
- Metadata: title, author, year, publisher, ISBN, notes
- "Search this book" button → `/search?q=&book=<slug>` (bound search later — see "Future enhancements")
- "Edit" and "Delete" buttons (delete asks for confirmation)
- (Later: list of recipes you've found in this book)

## API specifications

### POST /api/search

Existing route. Update to:
1. Fetch all books from Supabase at the start of each request (cache for 60s with `unstable_cache` or similar to avoid repeated Supabase round-trips on burst searches)
2. Use `slug` as `book_id` in the prompt (matches current prototype contract)
3. Return only results whose `book_id` matches a known slug

Keep existing JSON-extraction defensiveness (markdown fence stripping, fallback `[...]` slice).

### GET /api/books

Returns all books, sorted by `created_at DESC`. Include all columns.

### POST /api/books

Body: `{ title, author, year?, isbn?, cover_url?, publisher?, notes? }`. Generates slug server-side, inserts, returns the new row.

### PATCH /api/books/[id]

Body: any subset of editable fields. Returns updated row.

### DELETE /api/books/[id]

Returns `{ success: true }`. The UI confirms before calling.

### GET /api/lookup-isbn?isbn=...

Server-side proxy to:
```
https://www.googleapis.com/books/v1/volumes?q=isbn:<isbn>
```

Normalise the response to:

```ts
{
  title: string;
  author: string;        // joined with ", " if multiple
  year: number | null;   // parsed from publishedDate
  publisher: string | null;
  cover_url: string | null;  // prefer "thumbnail" or "smallThumbnail" from imageLinks; rewrite http→https
  isbn: string;
}
```

Return 404 if no results, 502 if Google Books fails.

## File structure (target)

```
cookbook-search/
├── app/
│   ├── page.tsx                    # Collection grid (was: search)
│   ├── search/page.tsx             # Search page (extracted from old page.tsx)
│   ├── books/
│   │   ├── new/page.tsx
│   │   └── [slug]/page.tsx
│   ├── api/
│   │   ├── search/route.ts         # Updated: reads from Supabase
│   │   ├── books/route.ts          # GET, POST
│   │   ├── books/[id]/route.ts     # PATCH, DELETE
│   │   └── lookup-isbn/route.ts    # GET
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── BookGrid.tsx
│   ├── BookCard.tsx                # Used in grid, with cover-or-fallback
│   ├── SearchInput.tsx             # Shared between / and /search
│   ├── ResultRow.tsx               # With cover thumbnail
│   └── AddBookForm.tsx
├── lib/
│   ├── types.ts
│   ├── supabase.ts                 # Server and client factory functions
│   ├── slug.ts                     # generateSlug, ensureUniqueSlug
│   └── google-books.ts             # ISBN lookup helper, response normaliser
├── data/
│   └── books.json                  # Keep for the seed script
├── scripts/
│   └── seed.ts                     # One-time migration of books.json into Supabase
├── .env.local
├── .env.local.example              # Updated with Supabase keys
└── ...
```

## Environment variables

```
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...      # Used server-side only, for writes
```

Use the service role key in API routes (server-only). Use the anon key for any client-side reads (likely none in this build).

## Seed script

Create `scripts/seed.ts` that:
1. Reads `data/books.json`
2. For each entry, inserts into Supabase using the existing slug as the `slug` field
3. Uses `upsert` on `slug` so re-running is idempotent

Run it once after Supabase is set up: `npx tsx scripts/seed.ts`.

## Design notes

- Keep the existing aesthetic: warm off-white background, generous whitespace, system font stack, minimal borders
- Use `aspect-ratio: 2/3` for all book covers — it's the standard cookbook proportion
- Fallback cover (no `cover_url`): render a card with solid colour (deterministically picked from the slug, so each book has a stable colour) and the title in a serif font, vertically centred. Don't use stock placeholder images.
- Loading skeletons for the grid (shimmer rectangles in the same aspect ratio)
- All pages constrained to `max-width: 1100px` centered, with 24px horizontal padding

## Deployment notes

Deploying as a "personal site" without auth means **the URL is publicly reachable** and anyone who finds it can add/delete books. For a personal tool that's usually fine, but two safeguards to add:

1. **Vercel password protection** — under Project Settings → Deployment Protection, enable "Vercel Authentication" or set a password. Free tier supports this on preview deployments; for production you may need Pro, otherwise use option 2.
2. **Lightweight write protection** — gate `POST/PATCH/DELETE` API routes behind a shared secret in an `Authorization` header. Set `WRITE_TOKEN` env var, have the client include it from a `localStorage` value the user pastes in once. Trivial to implement, blocks drive-by writes.

Recommend option 2 for simplicity. Read endpoints (search, list books) stay open.

## Suggested enhancements (after the core build)

These are worth flagging in case any of them appeal — don't build them yet.

1. **Recipe verification feedback loop**
   When a search result is shown, add a thumbs-up / thumbs-down on each row. Thumbs-up creates a `verified_recipes` row (book_id, recipe_title, page_number). The search prompt then includes "verified recipes from this collection" as ground truth, dramatically improving accuracy over time. Highest-leverage enhancement of all of these.

2. **Save searches / favourites**
   Bookmark a recipe match so you can find it again without re-searching. Useful for "tonight's dinner" → "this week's grocery list" workflows.

3. **Filters in search**
   Restrict to specific books, cuisines (inferred from book metadata), or time-of-day (breakfast/lunch/dinner — Claude can return this as a tag in the response).

4. **"Cook now" mode**
   Click a recipe match → modal with "How many servings?" → Claude returns a best-guess of the recipe text. Useful for famous recipes Claude knows verbatim, less so for obscure ones. Frame the output as "rough recreation, check the actual book."

5. **Shopping list generator**
   Pick 3–4 recipes, Claude generates a consolidated shopping list. Pairs well with a weekly meal-planning workflow.

6. **Cover image management**
   One-time script: for any book with empty `cover_url`, hit Google Books search by title+author, take the first hit's thumbnail, save to Supabase. Could also let the user upload custom covers and store in Supabase Storage.

7. **OCR-based index ingestion (the big one)**
   For each book, scan the back-of-book index pages, OCR them, store as a per-book lookup table. Search then becomes hybrid: (a) Claude finds candidate recipes from its general knowledge, (b) the page numbers are corrected against the OCR'd index. Removes the unreliable-page-number problem entirely. Most effort, biggest accuracy win.

8. **Mobile camera spine scan to add a book**
   On `/books/new`, an alternative tab: "Scan spine" → opens camera → snaps photo → Claude vision identifies the book → confirms title/author with you → saves. Way faster than typing for a big collection.

9. **Multi-collection support**
   You and Ben (from the earlier multi-user spec) can each have a collection, with shared and private books. Adds auth complexity — only worth it if a second user is genuinely going to use it.

## Definition of done for this build

- All 44 books migrated from JSON to Supabase
- Landing page shows the collection as a cover grid
- Search page works identically to current prototype, but reads books from Supabase and shows cover thumbnails on each result
- Add-a-book flow works for both ISBN lookup and manual entry
- Edit and delete work on book detail page
- Deployed to Vercel at a real URL with the write-token protection in place
- README updated with Supabase setup instructions and the seed script command

## Things to deliberately leave out

- Auth / multi-user
- Recipe feedback / verification
- Search filters
- Cover image upload (only URLs for now)
- Tags or categories on books
- Anything from the "suggested enhancements" list

Keep the build focused. The current prototype is good and works — don't rewrite what's working.
