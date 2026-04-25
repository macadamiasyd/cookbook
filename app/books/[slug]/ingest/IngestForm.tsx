'use client';

import { useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Book } from '@/lib/types';

interface RecipeRow {
  _id: string;
  recipe_title: string;
  page_number: string;
  category: string;
  selected: boolean;
}

interface UploadedFile {
  _id: string;
  file: File;
  previewUrl: string | null;
}

type Step = 'upload' | 'processing' | 'review';

function uid() {
  return Math.random().toString(36).slice(2);
}

function isHeic(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith('.heic') || name.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif';
}

export default function IngestForm({ book }: { book: Book }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragItemRef = useRef<number | null>(null);

  const [step, setStep] = useState<Step>('upload');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [processError, setProcessError] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [source, setSource] = useState<'index_ocr' | 'manual' | 'claude_seeded'>('index_ocr');

  // ── File management ──────────────────────────────────────────────────────

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    const entries: UploadedFile[] = arr.map((f) => ({
      _id: uid(),
      file: f,
      previewUrl: isHeic(f) ? null : URL.createObjectURL(f),
    }));
    setUploadedFiles((prev) => [...prev, ...entries]);
  }, []);

  function removeFile(id: string) {
    setUploadedFiles((prev) => {
      const f = prev.find((x) => x._id === id);
      if (f?.previewUrl) URL.revokeObjectURL(f.previewUrl);
      return prev.filter((x) => x._id !== id);
    });
  }

  // ── Drag-and-drop for drop zone (desktop only) ───────────────────────────

  function handleDropZone(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  // ── Drag-to-reorder thumbnails (desktop only) ────────────────────────────

  function handleThumbDragStart(e: React.DragEvent, idx: number) {
    dragItemRef.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleThumbDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    const from = dragItemRef.current;
    if (from === null || from === idx) return;
    setUploadedFiles((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(idx, 0, item);
      dragItemRef.current = idx;
      return next;
    });
  }

  // ── Process (OCR) — one image at a time ─────────────────────────────────

  async function handleProcess() {
    setProcessError(null);
    setProcessing(true);
    setStep('processing');

    const allRecipes: { recipe_title: string; page_number: number | null; category: string | null }[] = [];
    const allErrors: string[] = [];

    try {
      for (let i = 0; i < uploadedFiles.length; i++) {
        const uf = uploadedFiles[i];
        setProgressLabel(`Processing image ${i + 1} of ${uploadedFiles.length}`);

        const form = new FormData();
        form.append('images', uf.file);

        const res = await fetch(`/api/books/${book.id}/ingest-index`, {
          method: 'POST',
          body: form,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let data: any;
        try {
          data = await res.json();
        } catch {
          const text = await res.text().catch(() => '(no body)');
          allErrors.push(`${uf.file.name}: Server error ${res.status} — ${text.slice(0, 200)}`);
          continue;
        }

        if (!res.ok) {
          allErrors.push(`${uf.file.name}: ${(data.error as string) || 'Failed'}`);
          continue;
        }

        if (data.errors?.length) allErrors.push(...data.errors);
        if (data.recipes?.length) allRecipes.push(...data.recipes);

        if (data.recipes?.length === 0 && data.debug?.length) {
          allErrors.push(`${uf.file.name}: Claude returned 0 recipes.\nRaw: ${data.debug[0].text}`);
        }
      }

      if (allErrors.length && !allRecipes.length) {
        setProcessError(allErrors.join('\n\n'));
        setStep('upload');
        return;
      }

      if (allErrors.length) setProcessError(`Some images had errors:\n${allErrors.join('\n')}`);

      const rows = allRecipes.map((r) => ({
        _id: uid(),
        recipe_title: r.recipe_title,
        page_number: r.page_number != null ? String(r.page_number) : '',
        category: r.category ?? '',
        selected: false,
      }));

      if (rows.length === 0) {
        setProcessError('No recipes were extracted from any image.');
        setStep('upload');
        return;
      }

      setRecipes(rows);
      setStep('review');
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : 'Processing failed');
      setStep('upload');
    } finally {
      setProcessing(false);
      setProgressLabel('');
    }
  }

  // ── Review table helpers ─────────────────────────────────────────────────

  function updateRecipe(id: string, field: keyof Omit<RecipeRow, '_id' | 'selected'>, value: string) {
    setRecipes((prev) => prev.map((r) => r._id === id ? { ...r, [field]: value } : r));
  }

  function toggleSelect(id: string) {
    setRecipes((prev) => prev.map((r) => r._id === id ? { ...r, selected: !r.selected } : r));
  }

  function toggleSelectAll() {
    const anySelected = recipes.some((r) => r.selected);
    setRecipes((prev) => prev.map((r) => ({ ...r, selected: !anySelected })));
  }

  function deleteSelected() {
    setRecipes((prev) => prev.filter((r) => !r.selected));
  }

  function deleteRow(id: string) {
    setRecipes((prev) => prev.filter((r) => r._id !== id));
  }

  function addRow() {
    setRecipes((prev) => [
      ...prev,
      { _id: uid(), recipe_title: '', page_number: '', category: '', selected: false },
    ]);
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaveError(null);
    const valid = recipes.filter((r) => r.recipe_title.trim());
    if (!valid.length) {
      setSaveError('No recipes to save — add at least one title.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/books/${book.id}/recipes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
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
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function startManual() {
    setSource('manual');
    setRecipes([{ _id: uid(), recipe_title: '', page_number: '', category: '', selected: false }]);
    setStep('review');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (step === 'processing') {
    return (
      <div className="flex flex-col items-center py-16 gap-4 text-stone-500">
        <div className="w-8 h-8 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin" />
        <p className="text-sm text-center px-4">{progressLabel || 'Starting…'}</p>
        <p className="text-xs text-stone-400">About 15–30 seconds per image.</p>
      </div>
    );
  }

  if (step === 'review') {
    const selectedCount = recipes.filter((r) => r.selected).length;
    const validCount = recipes.filter((r) => r.recipe_title.trim()).length;

    return (
      <div>
        {source === 'claude_seeded' && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
            These recipes were generated by Claude. Verify them against your physical copy before saving.
          </div>
        )}

        {/* Controls row — stacks on mobile */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <p className="text-sm text-stone-500">
            {validCount} recipe{validCount !== 1 ? 's' : ''} ready to save
          </p>
          <div className="flex items-center gap-2">
            {selectedCount > 0 && (
              <button
                onClick={deleteSelected}
                className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
              >
                Delete {selectedCount} selected
              </button>
            )}
            <label className="text-xs text-stone-500 flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={recipes.length > 0 && recipes.every((r) => r.selected)}
                onChange={toggleSelectAll}
                className="rounded"
              />
              Select all
            </label>
          </div>
        </div>

        {/* Table — horizontally scrollable on mobile, Category hidden on small screens */}
        <div className="border border-stone-200 rounded-lg overflow-hidden mb-4 overflow-x-auto">
          <table className="w-full min-w-[360px] text-sm">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="w-8 px-2 py-2" />
                <th className="text-left px-3 py-2 font-medium text-stone-600">Recipe title</th>
                <th className="text-left px-3 py-2 font-medium text-stone-600 w-16">Page</th>
                <th className="hidden sm:table-cell text-left px-3 py-2 font-medium text-stone-600 w-32">Category</th>
                <th className="w-8 px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {recipes.map((row) => (
                <tr key={row._id} className={row.selected ? 'bg-stone-50' : 'bg-white'}>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={() => toggleSelect(row._id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="text"
                      value={row.recipe_title}
                      onChange={(e) => updateRecipe(row._id, 'recipe_title', e.target.value)}
                      className="w-full px-1 py-0.5 rounded border border-transparent hover:border-stone-200 focus:border-stone-400 focus:outline-none text-sm"
                      placeholder="Recipe title"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      value={row.page_number}
                      onChange={(e) => updateRecipe(row._id, 'page_number', e.target.value)}
                      className="w-full px-1 py-0.5 rounded border border-transparent hover:border-stone-200 focus:border-stone-400 focus:outline-none text-sm"
                      placeholder="—"
                    />
                  </td>
                  <td className="hidden sm:table-cell px-3 py-1.5">
                    <input
                      type="text"
                      value={row.category}
                      onChange={(e) => updateRecipe(row._id, 'category', e.target.value)}
                      className="w-full px-1 py-0.5 rounded border border-transparent hover:border-stone-200 focus:border-stone-400 focus:outline-none text-sm"
                      placeholder="—"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => deleteRow(row._id)}
                      className="text-stone-300 hover:text-red-500 transition-colors text-base leading-none"
                      title="Delete row"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={addRow}
          className="text-sm text-stone-500 hover:text-stone-800 mb-6"
        >
          + Add recipe
        </button>

        {saveError && <p className="text-red-600 text-sm mb-4">{saveError}</p>}

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving || validCount === 0}
            className="px-5 py-2.5 bg-stone-900 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-stone-700 transition-colors"
          >
            {saving ? 'Saving…' : `Save ${validCount} recipe${validCount !== 1 ? 's' : ''}`}
          </button>
          <button
            onClick={() => { setStep('upload'); setRecipes([]); }}
            disabled={saving}
            className="px-5 py-2.5 text-stone-600 text-sm hover:text-stone-900 disabled:opacity-50"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // step === 'upload'
  return (
    <div>
      {/* Source tabs */}
      <div className="flex border border-stone-200 rounded-lg p-1 mb-6 bg-stone-50 w-fit">
        {([
          ['index_ocr', 'Index photos (OCR)'],
          ['manual', 'Manual entry'],
        ] as const).map(([val, label]) => (
          <button
            key={val}
            onClick={() => { if (val === 'manual') { startManual(); } else { setSource(val); } }}
            className={`px-4 py-1.5 rounded text-sm transition-colors ${
              source === val
                ? 'bg-white text-stone-900 shadow-sm font-medium'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Drop zone — tap on mobile, drag-and-drop on desktop */}
      <div
        onDragEnter={() => setDragOver(true)}
        onDragLeave={() => setDragOver(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDropZone}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors mb-6 ${
          dragOver
            ? 'border-stone-500 bg-stone-50'
            : 'border-stone-200 hover:border-stone-400 hover:bg-stone-50'
        }`}
      >
        <p className="text-stone-500 text-sm font-medium mb-1">
          <span className="sm:hidden">Tap to choose photos</span>
          <span className="hidden sm:inline">Drop index page photos here, or click to browse</span>
        </p>
        <p className="text-stone-400 text-xs">JPG, PNG, or HEIC — one or more pages</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,.heic,.heif"
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {/* Preview grid */}
      {uploadedFiles.length > 0 && (
        <div className="mb-6">
          {/* Reorder hint — only shown on desktop where drag works */}
          <p className="hidden sm:block text-xs text-stone-400 mb-2">Drag thumbnails to reorder pages</p>
          <p className="sm:hidden text-xs text-stone-400 mb-2">Tap × to remove a photo</p>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {uploadedFiles.map((uf, idx) => (
              <div
                key={uf._id}
                draggable
                onDragStart={(e) => handleThumbDragStart(e, idx)}
                onDragOver={(e) => handleThumbDragOver(e, idx)}
                className="relative group cursor-grab active:cursor-grabbing"
              >
                <div className="aspect-[3/4] rounded overflow-hidden bg-stone-100 border border-stone-200">
                  {uf.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={uf.previewUrl} alt={uf.file.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center p-1 text-center">
                      <span className="text-stone-400 text-xs leading-tight">{uf.file.name}</span>
                    </div>
                  )}
                </div>
                {/* Remove button — always visible on mobile, hover on desktop */}
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(uf._id); }}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-stone-700 text-white text-xs flex sm:hidden group-hover:flex items-center justify-center leading-none"
                >
                  ×
                </button>
                <p className="text-xs text-stone-400 mt-0.5 truncate">{idx + 1}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {processError && (
        <pre className="text-red-600 text-xs mb-4 whitespace-pre-wrap bg-red-50 border border-red-200 rounded p-3 overflow-auto max-h-48">
          {processError}
        </pre>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleProcess}
          disabled={processing || uploadedFiles.length === 0}
          className="px-5 py-2.5 bg-stone-900 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-stone-700 transition-colors"
        >
          {processing ? 'Processing…' : `Process ${uploadedFiles.length} image${uploadedFiles.length !== 1 ? 's' : ''}`}
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
