import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import type { Book, RecipeMatch } from '@/lib/types';

const MAX_RESULTS = 30;
const MAX_PER_BOOK = 5;

// Escape PostgREST ILIKE wildcards so user input doesn't accidentally match more than expected.
function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, ''))
    .filter((w) => w.length >= 2);
}

interface RecipeRow {
  id: string;
  book_id: string;
  recipe_title: string;
  page_number: number | null;
  category: string | null;
}

// Score a row against the original query for ranking. Higher is better.
function scoreRow(row: RecipeRow, query: string, words: string[]): number {
  const title = row.recipe_title.toLowerCase();
  const category = (row.category ?? '').toLowerCase();
  const phrase = query.toLowerCase().trim();

  let score = 0;

  // Exact phrase in title is the strongest signal.
  if (title.includes(phrase)) score += 1000;

  // Each query word that appears in the title (as a whole-ish substring).
  for (const w of words) {
    if (title.includes(w)) score += 100;
    else if (category.includes(w)) score += 30;
  }

  // Penalise very long titles slightly so concise matches rise (Roast Chicken > Roast Chicken with Lemon, Garlic, Thyme & Onion Gravy).
  score -= Math.min(20, Math.floor(title.length / 30));

  return score;
}

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const words = tokenize(query);
    if (words.length === 0) {
      return NextResponse.json({
        results: [],
        books_considered: [],
        books_no_match: [],
        books_unfamiliar: [],
      });
    }

    const supabase = createServerClient();

    // Pull all books once so we can compute coverage and resolve book_id → slug.
    const { data: booksData, error: booksError } = await supabase
      .from('books')
      .select('id, slug, recipe_count');
    if (booksError) throw new Error(booksError.message);
    const books = (booksData ?? []) as Pick<Book, 'id' | 'slug' | 'recipe_count'>[];
    const idToSlug = new Map(books.map((b) => [b.id, b.slug] as const));
    const ingestedIds = new Set(books.filter((b) => (b.recipe_count ?? 0) > 0).map((b) => b.id));

    // AND-match each query word against (recipe_title OR category).
    let q = supabase
      .from('recipes')
      .select('id, book_id, recipe_title, page_number, category')
      .limit(500);

    for (const w of words) {
      const escaped = escapeIlike(w);
      q = q.or(`recipe_title.ilike.%${escaped}%,category.ilike.%${escaped}%`);
    }

    const { data: rowsData, error: rowsError } = await q;
    if (rowsError) throw new Error(rowsError.message);
    const rows = (rowsData ?? []) as RecipeRow[];

    // Score and sort.
    const scored = rows
      .map((r) => ({ r, s: scoreRow(r, query, words) }))
      .sort((a, b) => b.s - a.s);

    // Per-book cap, then global cap. Dedupe on title+page within a book so OCR re-ingests don't show duplicates.
    const perBook = new Map<string, number>();
    const seen = new Set<string>();
    const matches: RecipeMatch[] = [];
    const matchedBookIds = new Set<string>();

    for (const { r } of scored) {
      const slug = idToSlug.get(r.book_id);
      if (!slug) continue;
      const dedupeKey = `${r.book_id}|${r.recipe_title.toLowerCase()}|${r.page_number ?? ''}`;
      if (seen.has(dedupeKey)) continue;
      const count = perBook.get(r.book_id) ?? 0;
      if (count >= MAX_PER_BOOK) continue;
      seen.add(dedupeKey);
      perBook.set(r.book_id, count + 1);
      matchedBookIds.add(r.book_id);
      matches.push({
        book_id: slug,
        recipe_title: r.recipe_title,
        page_number: r.page_number,
        confidence: 'high',
      });
      if (matches.length >= MAX_RESULTS) break;
    }

    // Coverage classification:
    //  - considered: ingested books with at least one hit
    //  - no_match:   ingested books with zero hits for this query
    //  - unfamiliar: books not yet ingested (we have no recipe data for them)
    const books_considered: string[] = [];
    const books_no_match: string[] = [];
    const books_unfamiliar: string[] = [];
    for (const b of books) {
      if (!ingestedIds.has(b.id)) books_unfamiliar.push(b.slug);
      else if (matchedBookIds.has(b.id)) books_considered.push(b.slug);
      else books_no_match.push(b.slug);
    }

    return NextResponse.json({
      results: matches,
      books_considered,
      books_no_match,
      books_unfamiliar,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Search error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
