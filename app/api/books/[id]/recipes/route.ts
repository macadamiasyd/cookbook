import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';

interface RecipeInput {
  recipe_title: string;
  page_number: number | null;
  category: string | null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data: book, error: bookError } = await supabase
    .from('books')
    .select('id, slug')
    .eq('id', id)
    .single();

  if (bookError || !book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  const body = await req.json();
  const { recipes, source = 'index_ocr' } = body as {
    recipes: RecipeInput[];
    source?: string;
  };

  if (!Array.isArray(recipes)) {
    return NextResponse.json({ error: 'recipes must be an array' }, { status: 400 });
  }

  const validSources = ['index_ocr', 'manual', 'claude_seeded'];
  if (!validSources.includes(source)) {
    return NextResponse.json({ error: 'invalid source' }, { status: 400 });
  }

  // Delete existing recipes for this book before re-inserting
  const { error: deleteError } = await supabase
    .from('recipes')
    .delete()
    .eq('book_id', id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (recipes.length > 0) {
    const rows = recipes.map((r) => ({
      book_id: id,
      recipe_title: r.recipe_title.trim(),
      page_number: r.page_number ?? null,
      category: r.category?.trim() || null,
      source,
    }));

    const { error: insertError } = await supabase.from('recipes').insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  // Update book ingestion metadata
  const { error: updateError } = await supabase
    .from('books')
    .update({
      recipe_count: recipes.length,
      index_ingested_at: new Date().toISOString(),
      ingestion_method: source,
    })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ saved: recipes.length, book_slug: book.slug });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('book_id', id)
    .order('page_number', { ascending: true, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ recipes: data ?? [] });
}
