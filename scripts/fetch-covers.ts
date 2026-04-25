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

interface BookRow {
  id: string;
  slug: string;
  title: string;
  author: string;
  isbn: string | null;
  cover_url: string | null;
}

// ── ISBN lookup via Google Books title+author search ───────────────────��─────

async function fetchIsbnFromGoogleBooks(title: string, author: string): Promise<string | null> {
  const q = `${title} inauthor:"${author}"`;
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return null;
  const identifiers: { type: string; identifier: string }[] =
    item.volumeInfo?.industryIdentifiers ?? [];
  return (
    identifiers.find((i) => i.type === 'ISBN_13')?.identifier ??
    identifiers.find((i) => i.type === 'ISBN_10')?.identifier ??
    null
  );
}

// ── Cover fetching ─────────────────────────────────────────────────────��──────

async function tryOpenLibraryCover(isbn: string): Promise<Buffer | null> {
  const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
  const res = await fetch(url);
  if (!res.ok) return null; // 404 = no cover
  const buf = Buffer.from(await res.arrayBuffer());
  // Open Library sometimes returns a tiny placeholder even with default=false — reject if < 2 kB
  if (buf.length < 2048) return null;
  return buf;
}

async function tryGoogleBooksCover(isbn: string): Promise<Buffer | null> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const imageLinks = data.items?.[0]?.volumeInfo?.imageLinks;
  if (!imageLinks) return null;
  let coverUrl: string = imageLinks.thumbnail ?? imageLinks.smallThumbnail ?? '';
  if (!coverUrl) return null;
  coverUrl = coverUrl.replace(/^http:/, 'https:');
  if (!coverUrl.includes('zoom=')) coverUrl += '&zoom=1';
  const imgRes = await fetch(coverUrl);
  if (!imgRes.ok) return null;
  return Buffer.from(await imgRes.arrayBuffer());
}

async function fetchCoverBytes(isbn: string): Promise<Buffer | null> {
  return (await tryOpenLibraryCover(isbn)) ?? (await tryGoogleBooksCover(isbn));
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
  // Ensure bucket exists (create if missing)
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.find((b) => b.name === BUCKET)) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (error) {
      console.error(`Could not create bucket "${BUCKET}":`, error.message);
      process.exit(1);
    }
    console.log(`Created bucket: ${BUCKET}`);
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

  for (const book of books as BookRow[]) {
    let isbn = book.isbn;

    // Step 1: fetch ISBN if missing
    if (!isbn) {
      process.stdout.write(`[${book.slug}] No ISBN — searching Google Books…`);
      isbn = await fetchIsbnFromGoogleBooks(book.title, book.author);
      if (isbn) {
        await supabase.from('books').update({ isbn }).eq('id', book.id);
        process.stdout.write(` found ${isbn}\n`);
      } else {
        process.stdout.write(` not found\n`);
      }
    }

    if (!isbn) {
      console.log(`[${book.slug}] ✗ No ISBN available, skipping cover fetch`);
      failed.push(book.slug);
      continue;
    }

    // Step 2: fetch cover bytes
    process.stdout.write(`[${book.slug}] Fetching cover for ISBN ${isbn}…`);
    const bytes = await fetchCoverBytes(isbn);

    if (!bytes) {
      process.stdout.write(` no cover found\n`);
      failed.push(book.slug);
      continue;
    }

    // Step 3: upload and update
    try {
      const publicUrl = await uploadToStorage(book.slug, bytes);
      await supabase.from('books').update({ cover_url: publicUrl }).eq('id', book.id);
      process.stdout.write(` ✓\n`);
      succeeded.push(book.slug);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(` upload error: ${msg}\n`);
      failed.push(book.slug);
    }

    // Polite delay to avoid rate-limiting
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\n── Summary ──────────────────────────────`);
  console.log(`✓ Succeeded: ${succeeded.length}`);
  console.log(`✗ Still missing: ${failed.length}`);
  if (failed.length > 0) {
    console.log(`  Failed slugs: ${failed.join(', ')}`);
  }
}

main();
