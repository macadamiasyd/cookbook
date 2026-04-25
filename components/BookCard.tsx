'use client';

import Link from 'next/link';
import type { Book } from '@/lib/types';

const FALLBACK_COLORS = [
  '#c8b4a0', '#a8b4c0', '#b4a8c8', '#a0c8b4',
  '#c8a8b4', '#b4c8a0', '#c0b4a8', '#a8c0b4',
];

function fallbackColor(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) & 0xffffffff;
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

export default function BookCard({ book }: { book: Book }) {
  const isIngested = (book.recipe_count ?? 0) > 0;

  return (
    <div className="group">
      <Link
        href={`/books/${book.slug}`}
        className="block"
        title={`${book.title} — ${book.author}`}
      >
        <div
          className="w-full rounded overflow-hidden relative"
          style={{ aspectRatio: '2/3' }}
        >
          {book.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={book.cover_url}
              alt={book.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex flex-col items-center justify-center p-3 text-center"
              style={{ backgroundColor: fallbackColor(book.slug) }}
            >
              <span
                className="text-white font-serif text-xs leading-tight line-clamp-4"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              >
                {book.title}
              </span>
            </div>
          )}
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity p-2 w-full">
              <p className="text-white text-xs font-medium leading-tight line-clamp-2">{book.title}</p>
              <p className="text-white/80 text-xs leading-tight mt-0.5 line-clamp-1">{book.author}</p>
            </div>
          </div>
          {/* Ingest CTA on hover for un-ingested books */}
          {!isIngested && (
            <Link
              href={`/books/${book.slug}/ingest`}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 bg-stone-900/80 text-white text-[10px] rounded backdrop-blur-sm hover:bg-stone-900"
            >
              Ingest
            </Link>
          )}
        </div>
      </Link>

      <p className="text-xs text-stone-400 mt-1 text-center">
        {isIngested ? `${book.recipe_count} recipes` : 'not ingested'}
      </p>
    </div>
  );
}
