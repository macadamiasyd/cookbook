import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase';
import type { Book } from '@/lib/types';
import EditBookForm from './EditBookForm';

async function getBook(slug: string): Promise<Book | null> {
  const supabase = createServerClient();
  const { data } = await supabase.from('books').select('*').eq('slug', slug).single();
  return data as Book | null;
}

export default async function EditBookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const book = await getBook(slug);
  if (!book) notFound();

  return (
    <main className="max-w-[1100px] mx-auto px-6 py-10">
      <header className="flex items-center gap-4 mb-8">
        <Link href={`/books/${slug}`} className="text-stone-400 hover:text-stone-700 text-sm">
          ← Back
        </Link>
        <h1 className="text-xl font-medium tracking-tight text-stone-900">Edit book</h1>
      </header>
      <div className="max-w-xl">
        <EditBookForm book={book} />
      </div>
    </main>
  );
}
