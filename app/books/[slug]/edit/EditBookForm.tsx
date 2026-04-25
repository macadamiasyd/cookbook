'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Book } from '@/lib/types';

// Resize + compress image client-side so it fits under Vercel's 4.5 MB body limit.
// iPhone photos can be 5–10 MB; after canvas resize to 1600 px they're ~200–400 KB.
// Falls back to the original file if the browser can't decode the format (e.g. HEIC on non-Apple).
function compressForUpload(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1600;
      const ratio = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * ratio);
      canvas.height = Math.round(img.naturalHeight * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

export default function EditBookForm({ book }: { book: Book }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fields, setFields] = useState({
    title: book.title,
    author: book.author,
    year: book.year ? String(book.year) : '',
    cover_url: book.cover_url ?? '',
    publisher: book.publisher ?? '',
    isbn: book.isbn ?? '',
    notes: book.notes ?? '',
  });
  const [coverPreview, setCoverPreview] = useState<string | null>(book.cover_url ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof typeof fields, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setCoverPreview(URL.createObjectURL(file));
  }

  async function uploadPendingFile(): Promise<string | null> {
    if (!pendingFile) return null;
    setUploading(true);
    try {
      const compressed = await compressForUpload(pendingFile);
      const form = new FormData();
      form.append('file', compressed, pendingFile.name.replace(/\.(heic|heif)$/i, '.jpg'));
      const res = await fetch(`/api/books/${book.id}/cover`, {
        method: 'POST',
        headers: {},
        body: form,
      });
      let data: { error?: string; cover_url?: string };
      try {
        data = await res.json();
      } catch {
        throw new Error(`Server error ${res.status}`);
      }
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      return data.cover_url as string;
    } finally {
      setUploading(false);
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
      // Upload cover file first if one was selected
      let cover_url = fields.cover_url.trim() || null;
      if (pendingFile) {
        const uploaded = await uploadPendingFile();
        if (uploaded) cover_url = uploaded;
      }

      const res = await fetch(`/api/books/${book.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: fields.title.trim(),
          author: fields.author.trim(),
          year: fields.year ? parseInt(fields.year, 10) : null,
          cover_url,
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

  const busy = saving || uploading;

  return (
    <div className="space-y-4">
      {/* Cover image upload */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">Cover image</label>
        <div className="flex items-start gap-4">
          {/* Preview */}
          <div
            className="w-20 rounded overflow-hidden bg-stone-100 flex-shrink-0"
            style={{ aspectRatio: '2/3' }}
          >
            {coverPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverPreview} alt="Cover preview" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-stone-300 text-xs text-center p-1">
                No cover
              </div>
            )}
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 border border-stone-200 rounded text-sm text-stone-600 hover:bg-stone-50 transition-colors"
            >
              {coverPreview ? 'Replace image…' : 'Upload image…'}
            </button>
            <p className="text-xs text-stone-400">JPG, PNG, or HEIC · resized to 600px</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,.heic,.heif"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* Cover URL (manual fallback) */}
      <Field
        label="Cover URL"
        value={fields.cover_url}
        onChange={(v) => { set('cover_url', v); if (v) { setCoverPreview(v); setPendingFile(null); } }}
        placeholder="https://… (or upload above)"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Title *" value={fields.title} onChange={(v) => set('title', v)} />
        <Field label="Author *" value={fields.author} onChange={(v) => set('author', v)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Year" value={fields.year} onChange={(v) => set('year', v)} type="number" />
        <Field label="Publisher" value={fields.publisher} onChange={(v) => set('publisher', v)} />
      </div>
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
          disabled={busy}
          className="px-5 py-2.5 bg-stone-900 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-stone-700 transition-colors"
        >
          {uploading ? 'Uploading cover…' : saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          onClick={() => router.push(`/books/${book.slug}`)}
          disabled={busy}
          className="px-5 py-2.5 text-stone-600 text-sm hover:text-stone-900 disabled:opacity-50"
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
