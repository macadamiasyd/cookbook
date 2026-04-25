import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface JsonBook {
  id: string;
  title: string;
  author: string;
  year: number | null;
  cover: string;
}

async function seed() {
  const raw = fs.readFileSync(path.resolve(__dirname, '../data/books.json'), 'utf-8');
  const books: JsonBook[] = JSON.parse(raw);

  const rows = books.map((b) => ({
    slug: b.id,
    title: b.title,
    author: b.author,
    year: b.year ?? null,
    cover_url: b.cover || null,
    isbn: null,
    publisher: null,
    notes: null,
  }));

  const { error } = await supabase
    .from('books')
    .upsert(rows, { onConflict: 'slug' });

  if (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }

  console.log(`Seeded ${rows.length} books.`);
}

seed();
