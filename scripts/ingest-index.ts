/**
 * CLI script to ingest a book's recipe index from photos.
 *
 * Usage:
 *   npx tsx scripts/ingest-index.ts --book ottolenghi-simple --images ./indexes/*.jpg
 *   npx tsx scripts/ingest-index.ts --book ottolenghi-simple --images ./indexes/*.jpg --dry-run
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { createServerClient } from '../lib/supabase';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are extracting a recipe index from a cookbook. The image shows one or more index pages.

Return ONLY valid JSON:
{
  "recipes": [
    { "recipe_title": "string", "page_number": number, "category": "string or null" }
  ]
}

Reading order:
- Each image typically shows a two-page spread. Read the left page first (top to bottom), then the right page (top to bottom).
- The centre gutter where pages meet is not a column separator — index columns exist within each page, not across the gutter.
- Watch for entries that wrap across the gutter from the left page to the right page.
- Index pages often have multiple columns within a single page (commonly 2–3 columns). Read each column top to bottom, left to right. Do not interleave entries between columns.

Rules:
- Extract every recipe entry. Do not skip variations or sub-recipes.
- Skip pure ingredient cross-references like "tomatoes, see also..." — only include entries that point to an actual recipe page.
- If the index has section headers (Mains, Desserts, etc.), use those as category. Otherwise, set category to null.
- Recipe titles should be normalised: title case, no trailing punctuation, no page numbers in the title.
- If a recipe spans a page range like "45-47", use the first page (45).
- If you can't read an entry confidently, omit it rather than guess.
- Do not include front-matter entries like "Introduction", "About the author", "Acknowledgements".

Respond with the JSON object only. No preamble, no markdown fences.`;

interface RawRecipe {
  recipe_title: string;
  page_number: number | null;
  category: string | null;
}

// ── Arg parsing ────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
let bookSlug = '';
const imagePaths: string[] = [];
const dryRun = argv.includes('--dry-run');

for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--book') {
    bookSlug = argv[++i] ?? '';
  } else if (argv[i] === '--images') {
    i++;
    while (i < argv.length && !argv[i].startsWith('--')) {
      imagePaths.push(argv[i++]);
    }
    i--;
  }
}

if (!bookSlug || imagePaths.length === 0) {
  console.error('Usage: npx tsx scripts/ingest-index.ts --book <slug> --images <file1> [file2...] [--dry-run]');
  process.exit(1);
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function toJpegBase64(filePath: string): Promise<string> {
  const bytes = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const isHeic = ext === '.heic' || ext === '.heif';

  if (isHeic) {
    const converted = await sharp(bytes).rotate().jpeg({ quality: 90 }).toBuffer();
    return converted.toString('base64');
  }

  const processed = await sharp(bytes)
    .rotate()
    .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return processed.toString('base64');
}

function extractRecipes(text: string): RawRecipe[] {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(cleaned.substring(start, end + 1));
    if (!Array.isArray(parsed.recipes)) return [];
    return parsed.recipes
      .filter((r: unknown) => r && typeof (r as RawRecipe).recipe_title === 'string')
      .map((r: RawRecipe) => ({
        recipe_title: String(r.recipe_title).trim(),
        page_number: typeof r.page_number === 'number' ? r.page_number : null,
        category: r.category ? String(r.category).trim() : null,
      }));
  } catch {
    return [];
  }
}

function dedupeRecipes(recipes: RawRecipe[]): RawRecipe[] {
  const seen = new Set<string>();
  return recipes.filter((r) => {
    const key = `${r.recipe_title.toLowerCase().trim()}|${r.page_number ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nIngesting recipe index for: ${bookSlug}`);
  console.log(`Images: ${imagePaths.length}`);
  if (dryRun) console.log('DRY RUN — no database writes\n');

  // Verify book exists
  const supabase = createServerClient();
  const { data: book, error: bookError } = await supabase
    .from('books')
    .select('id, slug, title, author')
    .eq('slug', bookSlug)
    .single();

  if (bookError || !book) {
    console.error(`Book not found: ${bookSlug}`);
    process.exit(1);
  }

  console.log(`Found: "${book.title}" by ${book.author}\n`);

  const allRecipes: RawRecipe[] = [];
  let errorCount = 0;

  for (let i = 0; i < imagePaths.length; i++) {
    const filePath = imagePaths[i];
    process.stdout.write(`  [${i + 1}/${imagePaths.length}] ${path.basename(filePath)}… `);

    if (!fs.existsSync(filePath)) {
      console.log('NOT FOUND — skipped');
      errorCount++;
      continue;
    }

    try {
      const base64 = await toJpegBase64(filePath);

      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
              },
              { type: 'text', text: 'Extract all recipe entries from this index page.' },
            ],
          },
        ],
      });

      const rawText = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

      const recipes = extractRecipes(rawText);
      console.log(`${recipes.length} recipes`);
      allRecipes.push(...recipes);
    } catch (err) {
      console.log(`ERROR — ${err instanceof Error ? err.message : err}`);
      errorCount++;
    }
  }

  const deduped = dedupeRecipes(allRecipes);
  const removed = allRecipes.length - deduped.length;

  console.log(`\n── Results ────────────────────────────`);
  console.log(`  Extracted:   ${allRecipes.length} recipes`);
  if (removed > 0) console.log(`  Duplicates:  ${removed} removed`);
  console.log(`  Unique:      ${deduped.length} recipes`);
  if (errorCount > 0) console.log(`  Errors:      ${errorCount} images failed`);

  if (dryRun) {
    console.log('\nDRY RUN complete — sample output:');
    deduped.slice(0, 5).forEach((r) =>
      console.log(`  p.${r.page_number ?? '?'} — ${r.recipe_title}${r.category ? ` [${r.category}]` : ''}`)
    );
    if (deduped.length > 5) console.log(`  … and ${deduped.length - 5} more`);
    return;
  }

  if (deduped.length === 0) {
    console.log('\nNothing to save.');
    return;
  }

  console.log('\nWriting to database…');

  // Delete existing recipes
  await supabase.from('recipes').delete().eq('book_id', book.id);

  // Insert recipes in batches of 200
  const BATCH = 200;
  for (let i = 0; i < deduped.length; i += BATCH) {
    const batch = deduped.slice(i, i + BATCH).map((r) => ({
      book_id: book.id,
      recipe_title: r.recipe_title,
      page_number: r.page_number,
      category: r.category,
      source: 'index_ocr',
    }));
    const { error } = await supabase.from('recipes').insert(batch);
    if (error) throw new Error(`Insert failed: ${error.message}`);
  }

  // Update book metadata
  await supabase.from('books').update({
    recipe_count: deduped.length,
    index_ingested_at: new Date().toISOString(),
    ingestion_method: 'index_ocr',
  }).eq('id', book.id);

  console.log(`\n✓ Saved ${deduped.length} recipes for "${book.title}"`);
}

main().catch((err) => {
  console.error('\nFatal:', err);
  process.exit(1);
});
