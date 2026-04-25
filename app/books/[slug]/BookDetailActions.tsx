'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Book } from '@/lib/types';
export default function BookDetailActions({ book, slug }: { book: Book; slug: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/books/${book.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <div>
      {!confirming ? (
        <div className="flex gap-3">
          <button
            onClick={() => router.push(`/books/${slug}/edit`)}
            className="px-4 py-2 border border-stone-200 rounded-lg text-sm text-stone-600 hover:bg-stone-50 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => setConfirming(true)}
            className="px-4 py-2 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-sm text-stone-600">Delete &ldquo;{book.title}&rdquo;?</span>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-red-700 transition-colors"
          >
            {deleting ? 'Deleting…' : 'Yes, delete'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="px-4 py-2 text-sm text-stone-500 hover:text-stone-800"
          >
            Cancel
          </button>
        </div>
      )}
      {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
    </div>
  );
}
