import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase';
import type { Book } from '@/lib/types';
import BookDetailActions from './BookDetailActions';

async function getBook(slug: string): Promise<Book | null> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('books')
    .select('*')
    .eq('slug', slug)
    .single();
  return data as Book | null;
}

export default async function BookDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const book = await getBook(slug);
  if (!book) notFound();

  return (
    <main className="max-w-[1100px] mx-auto px-6 py-10">
      <header className="flex items-center gap-4 mb-8">
        <Link href="/" className="text-stone-400 hover:text-stone-700 text-sm">
          ← Collection
        </Link>
      </header>

      <div className="flex flex-col sm:flex-row gap-8">
        {/* Cover */}
        <div className="flex-shrink-0 w-40 sm:w-48">
          <div className="rounded overflow-hidden" style={{ aspectRatio: '2/3' }}>
            {book.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-stone-200 flex items-center justify-center p-4">
                <span
                  className="text-stone-600 text-sm text-center leading-tight"
                  style={{ fontFamily: 'Georgia, serif' }}
                >
                  {book.title}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Metadata */}
        <div className="flex-1">
          <h1 className="text-2xl font-medium tracking-tight text-stone-900 mb-1">{book.title}</h1>
          <p className="text-stone-500 text-lg mb-4">{book.author}</p>

          <dl className="space-y-2 text-sm mb-6">
            {book.year && (
              <Row label="Year">{book.year}</Row>
            )}
            {book.publisher && (
              <Row label="Publisher">{book.publisher}</Row>
            )}
            {book.isbn && (
              <Row label="ISBN">{book.isbn}</Row>
            )}
            {book.notes && (
              <Row label="Notes">{book.notes}</Row>
            )}
          </dl>

          <div className="flex flex-wrap gap-3 mb-6">
            <Link
              href={`/search?q=${encodeURIComponent(book.title)}`}
              className="px-4 py-2 bg-stone-900 text-white rounded-lg text-sm font-medium hover:bg-stone-700 transition-colors"
            >
              Search this book
            </Link>
          </div>

          <BookDetailActions book={book} slug={slug} />
        </div>
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="text-stone-400 w-20 flex-shrink-0">{label}</dt>
      <dd className="text-stone-700">{children}</dd>
    </div>
  );
}
