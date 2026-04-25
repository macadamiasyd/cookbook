import Link from 'next/link';
import type { Book, RecipeMatch } from '@/lib/types';

function confidenceColor(c: RecipeMatch['confidence']) {
  if (c === 'high') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (c === 'medium') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-stone-100 text-stone-600 border-stone-200';
}

interface ResultRowProps {
  match: RecipeMatch;
  book: Book;
}

export default function ResultRow({ match, book }: ResultRowProps) {
  return (
    <div className="flex gap-4 p-4 bg-white border border-stone-200 rounded-lg items-center">
      <Link href={`/books/${book.slug}`} className="flex-shrink-0">
        <div className="w-12 h-[72px] bg-stone-100 rounded overflow-hidden">
          {book.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
          )}
        </div>
      </Link>

      <div className="flex-1 min-w-0">
        <div className="font-medium text-stone-900 leading-tight">{match.recipe_title}</div>
        <Link href={`/books/${book.slug}`} className="text-sm text-stone-500 hover:text-stone-800 mt-0.5 block">
          {book.title} · {book.author}
        </Link>
        {match.confidence !== 'high' && (
          <div className={`inline-block text-xs mt-1.5 px-2 py-0.5 rounded border ${confidenceColor(match.confidence)}`}>
            {match.confidence} confidence{match.note ? ` · ${match.note}` : ''}
          </div>
        )}
      </div>

      <div className="text-sm font-medium px-3 py-1.5 bg-stone-100 rounded text-stone-700 flex-shrink-0">
        {match.page_number ? `p. ${match.page_number}` : 'page unknown'}
      </div>
    </div>
  );
}
