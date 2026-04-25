import type { IsbnLookupResult } from './types';

async function tryOpenLibraryCover(isbn: string): Promise<string | null> {
  const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
  const res = await fetch(url, { method: 'HEAD' }).catch(() => null);
  if (!res || !res.ok) return null;
  // Return the https version
  return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
}

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
  let googleCoverUrl: string | null =
    imageLinks.thumbnail ?? imageLinks.smallThumbnail ?? null;
  if (googleCoverUrl) {
    googleCoverUrl = googleCoverUrl.replace(/^http:/, 'https:');
    if (!googleCoverUrl.includes('zoom=')) googleCoverUrl += '&zoom=1';
  }

  // Prefer Open Library cover (higher resolution), fall back to Google Books
  const openLibraryCover = await tryOpenLibraryCover(clean);
  const cover_url = openLibraryCover ?? googleCoverUrl;

  return {
    title: info.title ?? '',
    author,
    year,
    publisher: info.publisher ?? null,
    cover_url,
    isbn: clean,
  };
}
