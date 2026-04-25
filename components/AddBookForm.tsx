'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Tab = 'isbn' | 'manual';

interface FormFields {
  title: string;
  author: string;
  year: string;
  cover_url: string;
  publisher: string;
  isbn: string;
  notes: string;
}

const EMPTY: FormFields = { title: '', author: '', year: '', cover_url: '', publisher: '', isbn: '', notes: '' };

export default function AddBookForm() {
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('isbn');
  const [isbnInput, setIsbnInput] = useState('');
  const [fields, setFields] = useState<FormFields>(EMPTY);
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isbnError, setIsbnError] = useState<string | null>(null);

  function set(key: keyof FormFields, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function handleIsbnLookup() {
    setIsbnError(null);
    setLookingUp(true);
    try {
      const res = await fetch(`/api/lookup-isbn?isbn=${encodeURIComponent(isbnInput)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lookup failed');
      setFields({
        title: data.title ?? '',
        author: data.author ?? '',
        year: data.year ? String(data.year) : '',
        cover_url: data.cover_url ?? '',
        publisher: data.publisher ?? '',
        isbn: data.isbn ?? isbnInput,
        notes: '',
      });
      setTab('manual');
    } catch (err) {
      setIsbnError(err instanceof Error ? err.message : 'ISBN lookup failed');
    } finally {
      setLookingUp(false);
    }
  }

  async function handleSave() {
    setError(null);
    if (!fields.title.trim() || !fields.author.trim()) {
      setError('Title and author are required.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/books', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
      router.push(`/books/${data.book.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex border border-stone-200 rounded-lg p-1 mb-6 bg-stone-50 w-fit">
        {(['isbn', 'manual'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded text-sm transition-colors ${
              tab === t
                ? 'bg-white text-stone-900 shadow-sm font-medium'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {t === 'isbn' ? 'ISBN lookup' : 'Manual entry'}
          </button>
        ))}
      </div>

      {/* ISBN lookup */}
      {tab === 'isbn' && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-stone-700 mb-1">ISBN</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={isbnInput}
              onChange={(e) => setIsbnInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleIsbnLookup()}
              placeholder="978-0-00-000000-0"
              className="flex-1 px-3 py-2 border border-stone-200 rounded text-sm focus:outline-none focus:border-stone-400"
            />
            <button
              onClick={handleIsbnLookup}
              disabled={lookingUp || !isbnInput.trim()}
              className="px-4 py-2 bg-stone-900 text-white rounded text-sm font-medium disabled:opacity-50 hover:bg-stone-700 transition-colors"
            >
              {lookingUp ? 'Looking up…' : 'Lookup'}
            </button>
          </div>
          {isbnError && (
            <p className="text-red-600 text-xs mt-1.5">{isbnError}</p>
          )}
          <p className="text-xs text-stone-400 mt-2">
            Fills the form automatically from Google Books — you can edit before saving.
          </p>
        </div>
      )}

      {/* Manual form fields */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Title *" value={fields.title} onChange={(v) => set('title', v)} />
          <Field label="Author *" value={fields.author} onChange={(v) => set('author', v)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Year" value={fields.year} onChange={(v) => set('year', v)} type="number" placeholder="2024" />
          <Field label="Publisher" value={fields.publisher} onChange={(v) => set('publisher', v)} />
        </div>
        <Field label="Cover URL" value={fields.cover_url} onChange={(v) => set('cover_url', v)} placeholder="https://..." />
        <Field label="ISBN" value={fields.isbn} onChange={(v) => set('isbn', v)} placeholder="978-..." />
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Notes</label>
          <textarea
            value={fields.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={2}
            placeholder="e.g. borrowed from Mum"
            className="w-full px-3 py-2 border border-stone-200 rounded text-sm focus:outline-none focus:border-stone-400 resize-none"
          />
        </div>
      </div>

      {error && <p className="text-red-600 text-sm mt-4">{error}</p>}

      <div className="flex gap-3 mt-6">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-stone-900 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-stone-700 transition-colors"
        >
          {saving ? 'Saving…' : 'Save book'}
        </button>
        <button
          onClick={() => router.push('/')}
          className="px-5 py-2.5 text-stone-600 text-sm hover:text-stone-900"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
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
