import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { generateSlug, ensureUniqueSlug } from '@/lib/slug';
import { isAuthorized } from '@/lib/auth';

export async function GET() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ books: data });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { title, author, year, isbn, cover_url, publisher, notes } = body;

  if (!title || !author) {
    return NextResponse.json({ error: 'Title and author are required' }, { status: 400 });
  }

  const supabase = createServerClient();

  // Fetch existing slugs to deduplicate
  const { data: existing } = await supabase.from('books').select('slug');
  const existingSlugs = new Set((existing ?? []).map((b: { slug: string }) => b.slug));

  const baseSlug = generateSlug(title, author);
  const slug = await ensureUniqueSlug(baseSlug, existingSlugs);

  const { data, error } = await supabase
    .from('books')
    .insert({ slug, title, author, year: year || null, isbn: isbn || null, cover_url: cover_url || null, publisher: publisher || null, notes: notes || null })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ book: data }, { status: 201 });
}
