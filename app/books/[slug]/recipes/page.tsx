import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase';
import type { Book, Recipe } from '@/lib/types';
import RecipesClient from './RecipesClient';

async function getBookAndRecipes(slug: string): Promise<{ book: Book; recipes: Recipe[] } | null> {
  const supabase = createServerClient();

  const { data: book } = await supabase
    .from('books')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!book) return null;

  const { data: recipes } = await supabase
    .from('recipes')
    .select('*')
    .eq('book_id', book.id)
    .order('page_number', { ascending: true, nullsFirst: false });

  return { book: book as Book, recipes: (recipes ?? []) as Recipe[] };
}

export default async function RecipesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await getBookAndRecipes(slug);
  if (!result) notFound();

  const { book, recipes } = result;

  return (
    <main className="max-w-[800px] mx-auto px-4 py-6">
      <header className="mb-6">
        <Link href={`/books/${slug}`} className="text-stone-400 hover:text-stone-700 text-sm">
          ← {book.title}
        </Link>
      </header>

      <h1 className="text-xl font-medium text-stone-900 mb-1">Edit recipes</h1>
      <p className="text-stone-500 text-sm mb-6">
        {recipes.length} recipe{recipes.length !== 1 ? 's' : ''} · {book.title}
      </p>

      <RecipesClient book={book} initialRecipes={recipes} />
    </main>
  );
}
