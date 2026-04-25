import Link from 'next/link';
import { createServerClient } from '@/lib/supabase';
import type { Book } from '@/lib/types';
import BookGrid from '@/components/BookGrid';
import SearchInput from '@/components/SearchInput';

async function getBooks(): Promise<Book[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data as Book[];
}

export default async function HomePage() {
  let books: Book[] = [];
  let fetchError: string | null = null;

  try {
    books = await getBooks();
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'Failed to load books';
  }

  return (
    <main className="max-w-[1100px] mx-auto px-6 py-10">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">Cookbook Search</h1>
          <p className="text-stone-500 mt-1 text-sm">
            {books.length} {books.length === 1 ? 'book' : 'books'} in your collection
          </p>
        </div>
        <Link
          href="/books/new"
          className="px-4 py-2 bg-stone-900 text-white rounded-lg text-sm font-medium hover:bg-stone-700 transition-colors"
        >
          + Add a book
        </Link>
      </header>

      <div className="mb-8">
        <SearchInput navigateOnSubmit />
      </div>

      {fetchError ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {fetchError}
        </div>
      ) : (
        <BookGrid books={books} />
      )}
    </main>
  );
}
