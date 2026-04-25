import type { IsbnLookupResult } from './types';

export async function lookupIsbn(isbn: string): Promise<IsbnLookupResult> {
  const clean = isbn.replace(/[\s-]/g, '');
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${clean}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Books API error: ${res.status}`);

  const data = await res.json();
  if (!data.items?.length) throw new Error('No book found for that ISBN');

  const info = data.items[0].volumeInfo;

  const authors: string[] = info.authors ?? [];
  const author = authors.join(', ') || 'Unknown';

  const year = info.publishedDate
    ? parseInt(info.publishedDate.slice(0, 4), 10) || null
    : null;

  const imageLinks = info.imageLinks ?? {};
  let cover_url: string | null =
    imageLinks.thumbnail ?? imageLinks.smallThumbnail ?? null;
  if (cover_url) cover_url = cover_url.replace(/^http:/, 'https:');

  return {
    title: info.title ?? '',
    author,
    year,
    publisher: info.publisher ?? null,
    cover_url,
    isbn: clean,
  };
}
