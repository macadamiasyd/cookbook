'use client';

import type { Book } from '@/lib/types';
import Link from 'next/link';

const FALLBACK_COLORS = [
  '#c8b4a0', '#a8b4c0', '#b4a8c8', '#a0c8b4',
  '#c8a8b4', '#b4c8a0', '#c0b4a8', '#a8c0b4',
];

function fallbackColor(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) & 0xffffffff;
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

function BookChip({ book }: { book: Book }) {
  return (
    <Link
      href={`/books/${book.slug}`}
      title={`${book.title} — ${book.author}`}
      className="flex-shrink-0 rounded overflow-hidden border border-stone-200 hover:border-stone-400 transition-colors"
      style={{ width: 24, height: 36 }}
    >
      {book.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
      ) : (
        <div
          className="w-full h-full"
          style={{ backgroundColor: fallbackColor(book.slug) }}
        />
      )}
    </Link>
  );
}

interface Group {
  label: string;
  slugs: string[];
}

interface Props {
  considered: string[];
  noMatch: string[];
  unfamiliar: string[];
  totalBooks: number;
  books: Map<string, Book>;
}

export default function CoverageDisclosure({ considered, noMatch, unfamiliar, totalBooks, books }: Props) {
  const groups: Group[] = [
    { label: 'Considered with matches', slugs: considered },
    { label: 'Considered, no match', slugs: noMatch },
    { label: 'Not familiar', slugs: unfamiliar },
  ].filter((g) => g.slugs.length > 0);

  if (groups.length === 0) return null;

  return (
    <details className="mt-6 rounded-lg border border-stone-200 bg-stone-50 overflow-hidden">
      <summary className="px-4 py-3 text-sm text-stone-500 cursor-pointer select-none hover:text-stone-700 list-none flex items-center gap-1.5">
        <span className="text-stone-400 text-xs">▸</span>
        Why these results?
        <span className="text-stone-400">({totalBooks} books considered)</span>
      </summary>

      <div className="px-4 pb-4 space-y-4 border-t border-stone-200 pt-4">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-xs text-stone-400 mb-2">
              {group.label} ({group.slugs.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {group.slugs.map((slug) => {
                const book = books.get(slug);
                if (!book) return null;
                return <BookChip key={slug} book={book} />;
              })}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
