import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase';
import type { Book, RecipeMatch } from '@/lib/types';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function getBooks(): Promise<Book[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data as Book[];
}

interface RawResponse {
  results: RecipeMatch[];
  books_considered: string[];
  books_no_match: string[];
  books_unfamiliar: string[];
}

function extractJsonObject(text: string): RawResponse {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  const tryParse = (s: string): RawResponse | null => {
    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }
    return null;
  };

  const result =
    tryParse(cleaned) ??
    (() => {
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start !== -1 && end > start) return tryParse(cleaned.substring(start, end + 1));
      return null;
    })();

  if (!result) throw new Error('Could not parse JSON object from model response');

  return {
    results: Array.isArray(result.results) ? result.results : [],
    books_considered: Array.isArray(result.books_considered) ? result.books_considered : [],
    books_no_match: Array.isArray(result.books_no_match) ? result.books_no_match : [],
    books_unfamiliar: Array.isArray(result.books_unfamiliar) ? result.books_unfamiliar : [],
  };
}

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
    }

    const books = await getBooks();
    const knownSlugs = new Set(books.map((b) => b.slug));

    const bookList = books
      .map((b) => `- id: "${b.slug}" — "${b.title}" by ${b.author}${b.year ? ` (${b.year})` : ''}`)
      .join('\n');

    const userPrompt = `The user owns these cookbooks:
${bookList}

Search query: "${query}"

Return up to 12 relevant recipes from these books. Use only your knowledge of the actual published editions. Be honest about page-number uncertainty — only claim "high" confidence if you're genuinely certain the recipe exists in that book and the page is approximately correct.

Respond with ONLY valid JSON in this exact shape (no preamble, no markdown):

{
  "results": [
    {
      "book_id": "<slug from the list>",
      "recipe_title": "exact recipe title as it appears in the book",
      "page_number": 123,
      "confidence": "high" | "medium" | "low",
      "note": "brief reason if confidence isn't high"
    }
  ],
  "books_considered": ["<slug>", "<slug>"],
  "books_no_match": ["<slug>", "<slug>"],
  "books_unfamiliar": ["<slug>", "<slug>"]
}

Where:
- results: up to 12 recipe matches, ordered by relevance
- books_considered: slugs of books you actively searched and found at least one match in (subset overlaps with results)
- books_no_match: slugs of books you searched but found no relevant recipe for this query
- books_unfamiliar: slugs of books you don't have meaningful content knowledge of — be honest. If you only know the title and author but couldn't name specific recipes from the book, list it here.

Every slug from the user's collection should appear in exactly one of: books_considered, books_no_match, or books_unfamiliar. Do not invent slugs that aren't in the list above.

Confidence guide:
- high: certain this recipe exists in this book and page is approximately correct
- medium: recipe exists but page number is uncertain
- low: recipe likely exists but uncertain about specifics

Use page_number: null if you genuinely don't know.`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system:
        'You are a cookbook expert with detailed knowledge of published cookbooks. You always respond with valid JSON only — no preamble, no markdown fences, no explanation.',
      messages: [{ role: 'user', content: userPrompt }],
    });

    const rawText = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    if (!rawText) {
      return NextResponse.json({ error: 'Empty response from model' }, { status: 502 });
    }

    const raw = extractJsonObject(rawText);

    // Filter all slug arrays to known slugs only
    const filterSlugs = (arr: string[]) => arr.filter((s) => knownSlugs.has(s));

    const results = raw.results.filter((r) => r && knownSlugs.has(r.book_id));
    const books_considered = filterSlugs(raw.books_considered);
    const books_no_match = filterSlugs(raw.books_no_match);
    const books_unfamiliar = filterSlugs(raw.books_unfamiliar);

    const total = books_considered.length + books_no_match.length + books_unfamiliar.length;
    if (total !== books.length) {
      console.warn(`Coverage mismatch: ${total} classified, ${books.length} in collection`);
    }

    return NextResponse.json({ results, books_considered, books_no_match, books_unfamiliar });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Search error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
