import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase';
import type { Book } from '@/lib/types';
import IngestForm from './IngestForm';

async function getBook(slug: string): Promise<Book | null> {
  const supabase = createServerClient();
  const { data } = await supabase.from('books').select('*').eq('slug', slug).single();
  return data as Book | null;
}

export default async function IngestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const book = await getBook(slug);
  if (!book) notFound();

  return (
    <main className="max-w-[800px] mx-auto px-6 py-10">
      <header className="flex items-center gap-4 mb-8">
        <Link href={`/books/${slug}`} className="text-stone-400 hover:text-stone-700 text-sm">
          ← {book.title}
        </Link>
      </header>

      <div className="mb-8">
        <h1 className="text-2xl font-medium tracking-tight text-stone-900">Ingest recipe index</h1>
        <p className="text-stone-500 mt-1 text-sm">
          {book.title} &mdash; {book.author}
        </p>
      </div>

      <IngestForm book={book} />
    </main>
  );
}
