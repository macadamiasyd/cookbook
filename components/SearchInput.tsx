'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const SUGGESTIONS = [
  'roast chicken',
  'eggplant',
  'chocolate dessert',
  'green curry',
  'quick weeknight pasta',
  'something with miso',
  'vegetarian dinner party',
];

interface SearchInputProps {
  defaultValue?: string;
  onSearch?: (q: string) => void;
  navigateOnSubmit?: boolean;
  disabled?: boolean;
}

export default function SearchInput({
  defaultValue = '',
  onSearch,
  navigateOnSubmit = false,
  disabled = false,
}: SearchInputProps) {
  const [value, setValue] = useState(defaultValue);
  const router = useRouter();

  function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    if (navigateOnSubmit) {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    } else {
      onSearch?.(trimmed);
    }
  }

  function handleSuggestion(s: string) {
    setValue(s);
    submit(s);
  }

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit(value)}
          placeholder="Search for a recipe or ingredient..."
          className="flex-1 px-4 py-3 bg-white border border-stone-200 rounded-lg text-base focus:outline-none focus:border-stone-400"
          disabled={disabled}
        />
        <button
          onClick={() => submit(value)}
          disabled={disabled || !value.trim()}
          className="px-5 py-3 bg-stone-900 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-stone-700 transition-colors"
        >
          {disabled ? 'Searching…' : 'Search'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => handleSuggestion(s)}
            disabled={disabled}
            className="text-xs px-3 py-1.5 bg-white border border-stone-200 rounded-full text-stone-600 hover:bg-stone-50 transition-colors disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
