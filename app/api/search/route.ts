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

function extractJsonArray(text: string): RecipeMatch[] {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      for (const key of Object.keys(parsed)) {
        if (Array.isArray(parsed[key])) return parsed[key];
      }
    }
  } catch {
    // fall through
  }

  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.substring(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through
    }
  }

  throw new Error('Could not parse JSON array from model response');
}

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not set' },
        { status: 500 }
      );
    }

    const books = await getBooks();

    const bookList = books
      .map((b) => `- id: "${b.slug}" — "${b.title}" by ${b.author}${b.year ? ` (${b.year})` : ''}`)
      .join('\n');

    const userPrompt = `The user owns these cookbooks:
${bookList}

Search query: "${query}"

Return up to 12 relevant recipes from these books. Use only your knowledge of the actual published editions. Be honest about page-number uncertainty — only claim "high" confidence if you're genuinely certain the recipe exists in that book and the page is approximately correct.

Respond with ONLY a JSON array. No preamble, no markdown fences, no explanation.

Format:
[
  {
    "book_id": "<must match an id from the list above>",
    "recipe_title": "exact recipe title as it appears in the book",
    "page_number": 123,
    "confidence": "high" | "medium" | "low",
    "note": "brief reason if confidence isn't high"
  }
]

Confidence guide:
- high: certain this recipe exists in this book and page is approximately correct
- medium: recipe exists but page number is uncertain
- low: recipe likely exists but uncertain about specifics

Use page_number: null if you genuinely don't know. Return [] if no relevant recipes. JSON array only.`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system:
        'You are a cookbook expert with detailed knowledge of published cookbooks. You always respond with valid JSON arrays only — no preamble, no markdown fences, no explanation.',
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

    const results = extractJsonArray(rawText);
    const knownSlugs = new Set(books.map((b) => b.slug));
    const filtered = results.filter((r) => r && knownSlugs.has(r.book_id));

    return NextResponse.json({ results: filtered });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Search error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
