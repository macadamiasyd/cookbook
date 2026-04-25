import { Suspense } from 'react';
import SearchPageInner from './SearchPageInner';

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="max-w-[1100px] mx-auto px-6 py-10 text-stone-400 text-sm">Loading…</div>}>
      <SearchPageInner />
    </Suspense>
  );
}
