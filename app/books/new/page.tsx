import Link from 'next/link';
import AddBookForm from '@/components/AddBookForm';

export default function NewBookPage() {
  return (
    <main className="max-w-[1100px] mx-auto px-6 py-10">
      <header className="flex items-center gap-4 mb-8">
        <Link href="/" className="text-stone-400 hover:text-stone-700 text-sm">
          ← Collection
        </Link>
        <h1 className="text-xl font-medium tracking-tight text-stone-900">Add a book</h1>
      </header>
      <div className="max-w-xl">
        <AddBookForm />
      </div>
    </main>
  );
}
