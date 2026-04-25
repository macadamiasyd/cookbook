import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as dotenv from 'dotenv';
import sharp from 'sharp';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const BUCKET = 'book-covers';
const DRY_RUN = process.argv.includes('--dry-run');

if (DRY_RUN) console.log('── DRY RUN — no writes will be made ──\n');

interface BookRow {
  id: string;
  slug: string;
  title: string;
  author: string;
  isbn: string | null;
  cover_url: string | null;
}

interface CoverResult {
  coverUrl: string;
  bytes: Buffer;
  isbn: string | null;
  source: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function titlesMatch(query: string, result: string): boolean {
  const q = normalise(query);
  const r = normalise(result);
  return r.includes(q) || q.includes(r);
}

async function fetchSafe(url: string): Promise<Response | null> {
  try {
    return await fetch(url);
  } catch {
    return null;
  }
}

async function tryDownloadCover(url: string): Promise<Buffer | null> {
  const res = await fetchSafe(url);
  if (!res || !res.ok) return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  // OL placeholder images are ~200 bytes; real covers are > 1 kB
  return bytes.length > 1000 ? bytes : null;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Open Library ──────────────────────────────────────────────────────────────

interface OLDoc {
  title: string;
  cover_i?: number;
  isbn?: string[];
}

async function searchOpenLibrary(
  title: string,
  author: string
): Promise<CoverResult | null> {
  const url =
    `https://openlibrary.org/search.json?` +
    `title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}&limit=5`;

  const res = await fetchSafe(url);
  if (!res || !res.ok) return null;

  const data: { docs?: OLDoc[] } = await res.json();
  const docs = data.docs ?? [];

  for (const doc of docs) {
    if (!titlesMatch(title, doc.title ?? '')) continue;

    const isbn = doc.isbn?.find((i) => i.length === 13) ?? doc.isbn?.[0] ?? null;

    // Try cover by Open Library cover ID first (highest quality)
    // ?default=false makes OL return 404 instead of a placeholder image
    if (doc.cover_i) {
      const coverUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg?default=false`;
      const bytes = await tryDownloadCover(coverUrl);
      if (bytes) return { coverUrl, bytes, isbn, source: `Open Library (cover_i=${doc.cover_i})` };
    }

    // Fall back to ISBN-based cover URL
    if (isbn) {
      const coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
      const bytes = await tryDownloadCover(coverUrl);
      if (bytes) return { coverUrl, bytes, isbn, source: `Open Library (isbn=${isbn})` };
    }
  }

  return null;
}

// ── Google Books fallback ─────────────────────────────────────────────────────

// Returns null if rate-limited (caller records the 429 and skips)
async function searchGoogleBooks(
  title: string,
  author: string
): Promise<CoverResult | 429 | null> {
  const q = `${title} inauthor:"${author}"`;
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5`;

  const res = await fetchSafe(url);
  if (!res) return null;
  if (res.status === 429) return 429;
  if (!res.ok) return null;

  const data = await res.json();
  const items: { volumeInfo: { title?: string; industryIdentifiers?: { type: string; identifier: string }[]; imageLinks?: { thumbnail?: string; smallThumbnail?: string } } }[] = data.items ?? [];

  for (const item of items) {
    const info = item.volumeInfo;
    if (!titlesMatch(title, info.title ?? '')) continue;

    const identifiers = info.industryIdentifiers ?? [];
    const isbn =
      identifiers.find((i) => i.type === 'ISBN_13')?.identifier ??
      identifiers.find((i) => i.type === 'ISBN_10')?.identifier ??
      null;

    const imageLinks = info.imageLinks ?? {};
    let coverUrl: string = imageLinks.thumbnail ?? imageLinks.smallThumbnail ?? '';
    if (!coverUrl) continue;
    coverUrl = coverUrl.replace(/^http:/, 'https:');
    if (!coverUrl.includes('zoom=')) coverUrl += '&zoom=1';

    const imgRes = await fetchSafe(coverUrl);
    if (!imgRes?.ok) continue;
    const bytes = Buffer.from(await imgRes.arrayBuffer());
    if (bytes.length < 1000) continue;

    return { coverUrl, bytes, isbn, source: 'Google Books' };
  }

  return null;
}

// ── Storage upload ────────────────────────────────────────────────────────────

async function uploadToStorage(slug: string, bytes: Buffer): Promise<string> {
  const resized = await sharp(bytes)
    .resize(600, undefined, { withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`${slug}.jpg`, resized, { contentType: 'image/jpeg', upsert: true });

  if (error) throw new Error(`Upload failed for ${slug}: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(`${slug}.jpg`);
  return data.publicUrl;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!DRY_RUN) {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.find((b) => b.name === BUCKET)) {
      const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
      if (error) {
        console.error(`Could not create bucket "${BUCKET}":`, error.message);
        process.exit(1);
      }
      console.log(`Created bucket: ${BUCKET}\n`);
    }
  }

  const { data: books, error } = await supabase
    .from('books')
    .select('id, slug, title, author, isbn, cover_url')
    .is('cover_url', null);

  if (error) {
    console.error('Failed to fetch books:', error.message);
    process.exit(1);
  }

  if (!books || books.length === 0) {
    console.log('All books already have covers.');
    return;
  }

  console.log(`Processing ${books.length} books without covers…\n`);

  const succeeded: string[] = [];
  const failed: string[] = [];
  const rateLimited: string[] = [];

  for (const book of books as BookRow[]) {
    process.stdout.write(`[${book.slug}] `);

    // 1. Try Open Library (no rate limits, no key needed)
    process.stdout.write(`Open Library…`);
    let result = await searchOpenLibrary(book.title, book.author);

    // 2. Fall back to Google Books with 1 s delay
    if (!result) {
      process.stdout.write(` miss. Google Books…`);
      await delay(1000);
      const gbResult = await searchGoogleBooks(book.title, book.author);

      if (gbResult === 429) {
        process.stdout.write(` 429 rate-limited, skipping\n`);
        rateLimited.push(book.slug);
        continue;
      }
      result = gbResult;
    }

    if (!result) {
      process.stdout.write(` no cover found\n`);
      failed.push(book.slug);
      continue;
    }

    process.stdout.write(` found via ${result.source}`);

    if (DRY_RUN) {
      process.stdout.write(`\n  → would save cover_url from ${result.coverUrl}`);
      if (result.isbn && !book.isbn) process.stdout.write(`\n  → would save isbn=${result.isbn}`);
      process.stdout.write('\n');
      succeeded.push(book.slug);
      continue;
    }

    // Save ISBN if we discovered one
    if (result.isbn && !book.isbn) {
      await supabase.from('books').update({ isbn: result.isbn }).eq('id', book.id);
    }

    // Upload to Storage and update row
    try {
      const publicUrl = await uploadToStorage(book.slug, result.bytes);
      await supabase.from('books').update({ cover_url: publicUrl }).eq('id', book.id);
      process.stdout.write(` ✓\n`);
      succeeded.push(book.slug);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(` upload error: ${msg}\n`);
      failed.push(book.slug);
    }
  }

  console.log(`\n── Summary ────────────────────────────────────`);
  console.log(`✓ Succeeded:   ${succeeded.length}`);
  console.log(`✗ No cover:    ${failed.length}${failed.length ? `  (${failed.join(', ')})` : ''}`);
  if (rateLimited.length) {
    console.log(
      `⚠  Rate-limited: ${rateLimited.length} books skipped due to Google Books rate limit — retry tomorrow`
    );
    console.log(`   Slugs: ${rateLimited.join(', ')}`);
  }
}

main();
