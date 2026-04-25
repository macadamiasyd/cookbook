'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Book, Recipe } from '@/lib/types';

interface RecipeRow {
  _id: string;
  recipe_title: string;
  page_number: string;
  category: string;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

export default function RecipesClient({ book, initialRecipes }: { book: Book; initialRecipes: Recipe[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<RecipeRow[]>(() =>
    initialRecipes.map((r) => ({
      _id: uid(),
      recipe_title: r.recipe_title,
      page_number: r.page_number != null ? String(r.page_number) : '',
      category: r.category ?? '',
    }))
  );
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.recipe_title.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
    );
  }, [rows, search]);

  function update(id: string, field: keyof Omit<RecipeRow, '_id'>, value: string) {
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, [field]: value } : r)));
  }

  function deleteRow(id: string) {
    setRows((prev) => prev.filter((r) => r._id !== id));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { _id: uid(), recipe_title: '', page_number: '', category: '' },
    ]);
    setSearch('');
  }

  async function handleSave() {
    setError(null);
    const valid = rows.filter((r) => r.recipe_title.trim());
    if (!valid.length) {
      setError('No recipes to save.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/books/${book.id}/recipes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'index_ocr',
          recipes: valid.map((r) => ({
            recipe_title: r.recipe_title.trim(),
            page_number: r.page_number ? parseInt(r.page_number, 10) : null,
            category: r.category.trim() || null,
          })),
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

  const activeCount = rows.filter((r) => r.recipe_title.trim()).length;

  return (
    <div>
      {/* Search */}
      <div className="relative mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recipes…"
          className="w-full px-4 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-stone-400 pl-9"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      {search && visibleRows.length === 0 && (
        <p className="text-stone-400 text-sm text-center py-8">No recipes match &ldquo;{search}&rdquo;</p>
      )}

      {/* Recipe list */}
      <div className="space-y-1 mb-4">
        {visibleRows.map((row) => (
          <div key={row._id} className="flex items-center gap-2 py-1">
            <input
              type="number"
              value={row.page_number}
              onChange={(e) => update(row._id, 'page_number', e.target.value)}
              className="w-14 px-2 py-2.5 border border-stone-200 rounded text-sm text-center focus:outline-none focus:border-stone-400 flex-shrink-0"
              placeholder="p."
            />
            <input
              type="text"
              value={row.recipe_title}
              onChange={(e) => update(row._id, 'recipe_title', e.target.value)}
              className="flex-1 min-w-0 px-3 py-2.5 border border-stone-200 rounded text-sm focus:outline-none focus:border-stone-400"
              placeholder="Recipe title"
            />
            <button
              onClick={() => deleteRow(row._id)}
              className="w-9 h-9 flex items-center justify-center text-stone-300 hover:text-red-500 flex-shrink-0 transition-colors text-lg leading-none"
              title="Remove"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addRow}
        className="text-sm text-stone-500 hover:text-stone-800 py-2 mb-8"
      >
        + Add recipe
      </button>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving || activeCount === 0}
          className="px-5 py-3 bg-stone-900 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-stone-700 transition-colors"
        >
          {saving ? 'Saving…' : `Save ${activeCount} recipe${activeCount !== 1 ? 's' : ''}`}
        </button>
        <button
          onClick={() => router.push(`/books/${book.slug}`)}
          disabled={saving}
          className="px-5 py-3 text-stone-600 text-sm hover:text-stone-900 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
