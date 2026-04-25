'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Book, RecipeMatch } from '@/lib/types';
import SearchInput from '@/components/SearchInput';
import ResultRow from '@/components/ResultRow';
import CoverageDisclosure from '@/components/CoverageDisclosure';

interface Coverage {
  considered: string[];
  noMatch: string[];
  unfamiliar: string[];
}

export default function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [results, setResults] = useState<RecipeMatch[] | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [books, setBooks] = useState<Map<string, Book>>(new Map());
  const [booksLoaded, setBooksLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setCoverage(null);
    router.replace(`/search?q=${encodeURIComponent(q.trim())}`, { scroll: false });

    try {
      const [booksData, searchRes] = await Promise.all([
        !booksLoaded ? fetch('/api/books').then((r) => r.json()) : Promise.resolve(null),
        fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q.trim() }),
        }),
      ]);

      const searchData = await searchRes.json();
      if (!searchRes.ok) throw new Error(searchData.error || `Request failed (${searchRes.status})`);

      if (booksData) {
        const map = new Map<string, Book>(
          (booksData.books as Book[]).map((b) => [b.slug, b])
        );
        setBooks(map);
        setBooksLoaded(true);
      }

      setResults(searchData.results ?? []);
      setCoverage({
        considered: searchData.books_considered ?? [],
        noMatch: searchData.books_no_match ?? [],
        unfamiliar: searchData.books_unfamiliar ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [router, booksLoaded]);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setQuery(q);
      runSearch(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch(q: string) {
    setQuery(q);
    runSearch(q);
  }

  const totalBooks = books.size;

  return (
    <main className="max-w-[1100px] mx-auto px-6 py-10">
      <header className="flex items-center gap-4 mb-6">
        <Link href="/" className="text-stone-400 hover:text-stone-700 text-sm">
          ← Collection
        </Link>
        <h1 className="text-xl font-medium tracking-tight text-stone-900">Search</h1>
      </header>

      <div className="mb-8">
        <SearchInput
          defaultValue={query}
          onSearch={handleSearch}
          disabled={loading}
        />
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-6">
          <div className="font-medium mb-1">Search failed</div>
          <div className="text-xs font-mono">{error}</div>
        </div>
      )}

      {loading && (
        <div className="text-center py-12 text-stone-500 text-sm">
          Asking Claude to flip through your cookbooks…
        </div>
      )}

      {results && results.length === 0 && !loading && (
        <div className="text-center py-12 text-stone-500 text-sm">
          No matching recipes found in your collection.
        </div>
      )}

      {results && results.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-wider text-stone-400 mb-2">
            {results.length} {results.length === 1 ? 'result' : 'results'}
          </div>
          {results.map((r, i) => {
            const book = books.get(r.book_id);
            if (!book) return null;
            return <ResultRow key={i} match={r} book={book} />;
          })}
        </div>
      )}

      {results !== null && !loading && coverage && (
        <CoverageDisclosure
          considered={coverage.considered}
          noMatch={coverage.noMatch}
          unfamiliar={coverage.unfamiliar}
          totalBooks={totalBooks}
          books={books}
        />
      )}

      {!results && !loading && !error && (
        <div className="text-center py-12 text-stone-400 text-sm">
          Enter a search above or pick a suggestion.
        </div>
      )}
    </main>
  );
}
