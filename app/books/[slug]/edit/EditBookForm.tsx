'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Book } from '@/lib/types';
import { useWriteToken } from '@/components/WriteTokenGate';

export default function EditBookForm({ book }: { book: Book }) {
  const router = useRouter();
  const writeToken = useWriteToken();

  const [fields, setFields] = useState({
    title: book.title,
    author: book.author,
    year: book.year ? String(book.year) : '',
    cover_url: book.cover_url ?? '',
    publisher: book.publisher ?? '',
    isbn: book.isbn ?? '',
    notes: book.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof typeof fields, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setError(null);
    if (!fields.title.trim() || !fields.author.trim()) {
      setError('Title and author are required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/books/${book.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(writeToken ? { Authorization: `Bearer ${writeToken}` } : {}),
        },
        body: JSON.stringify({
          title: fields.title.trim(),
          author: fields.author.trim(),
          year: fields.year ? parseInt(fields.year, 10) : null,
          cover_url: fields.cover_url.trim() || null,
          publisher: fields.publisher.trim() || null,
          isbn: fields.isbn.trim() || null,
          notes: fields.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      router.push(`/books/${book.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Title *" value={fields.title} onChange={(v) => set('title', v)} />
        <Field label="Author *" value={fields.author} onChange={(v) => set('author', v)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Year" value={fields.year} onChange={(v) => set('year', v)} type="number" />
        <Field label="Publisher" value={fields.publisher} onChange={(v) => set('publisher', v)} />
      </div>
      <Field label="Cover URL" value={fields.cover_url} onChange={(v) => set('cover_url', v)} placeholder="https://..." />
      <Field label="ISBN" value={fields.isbn} onChange={(v) => set('isbn', v)} />
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Notes</label>
        <textarea
          value={fields.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-stone-200 rounded text-sm focus:outline-none focus:border-stone-400 resize-none"
        />
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-stone-900 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-stone-700 transition-colors"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          onClick={() => router.push(`/books/${book.slug}`)}
          className="px-5 py-2.5 text-stone-600 text-sm hover:text-stone-900"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-stone-200 rounded text-sm focus:outline-none focus:border-stone-400"
      />
    </div>
  );
}
