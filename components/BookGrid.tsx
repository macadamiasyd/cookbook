'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Book } from '@/lib/types';
import BookCard from './BookCard';

type SortKey = 'newest' | 'alpha' | 'author' | 'year';

function sortBooks(books: Book[], key: SortKey): Book[] {
  const sorted = [...books];
  switch (key) {
    case 'newest':
      return sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    case 'alpha':
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case 'author':
      return sorted.sort((a, b) => a.author.localeCompare(b.author));
    case 'year':
      return sorted.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  }
}

export default function BookGrid({ books }: { books: Book[] }) {
  const [sort, setSort] = useState<SortKey>('newest');

  if (books.length === 0) {
    return (
      <div className="text-center py-20 text-stone-400">
        <p className="text-sm mb-4">No books yet — add your first cookbook.</p>
        <Link
          href="/books/new"
          className="inline-block px-4 py-2 bg-stone-900 text-white rounded-lg text-sm font-medium hover:bg-stone-700 transition-colors"
        >
          Add a book
        </Link>
      </div>
    );
  }

  const sorted = sortBooks(books, sort);

  return (
    <div>
      <div className="flex justify-end mb-4">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="text-xs px-3 py-1.5 border border-stone-200 rounded bg-white text-stone-600 focus:outline-none focus:border-stone-400"
        >
          <option value="newest">Newest first</option>
          <option value="alpha">A–Z title</option>
          <option value="author">A–Z author</option>
          <option value="year">By year</option>
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {sorted.map((book) => (
          <BookCard key={book.id} book={book} />
        ))}
      </div>
    </div>
  );
}
