/**
 * CLI script to scan and remove duplicate recipes from the database.
 *
 * Usage:
 *   npx tsx scripts/dedupe-recipes.ts                  # all books, apply changes
 *   npx tsx scripts/dedupe-recipes.ts --dry-run        # preview only
 *   npx tsx scripts/dedupe-recipes.ts --book <slug>    # one book
 *   npx tsx scripts/dedupe-recipes.ts --book <slug> --dry-run
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv(); // also load .env if present
import { createClient } from '@supabase/supabase-js';
import { dedupeRecipes } from '../lib/recipes';

function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  }
  return createClient(url, key);
}

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const bookIdx = argv.indexOf('--book');
const bookSlug = bookIdx !== -1 ? argv[bookIdx + 1] ?? '' : '';

interface RecipeRow {
  id: string;
  recipe_title: string;
  page_number: number | null;
}

async function main() {
  const supabase = createServerClient();

  let booksQuery = supabase
    .from('books')
    .select('id, slug, title, recipe_count')
    .gt('recipe_count', 0);
  if (bookSlug) booksQuery = booksQuery.eq('slug', bookSlug);

  const { data: books, error: booksError } = await booksQuery;
  if (booksError) {
    console.error('Failed to fetch books:', booksError.message);
    process.exit(1);
  }
  if (!books || books.length === 0) {
    console.log('No matching books with ingested recipes.');
    return;
  }

  console.log(`\nScanning ${books.length} book${books.length === 1 ? '' : 's'}${dryRun ? ' (DRY RUN — no changes)' : ''}\n`);

  let totalRemoved = 0;
  let booksAffected = 0;

  for (const book of books) {
    const { data: rows, error: rowsError } = await supabase
      .from('recipes')
      .select('id, recipe_title, page_number')
      .eq('book_id', book.id);

    if (rowsError) {
      console.warn(`  ${book.slug}: failed to fetch — ${rowsError.message}`);
      continue;
    }

    const recipes = (rows ?? []) as RecipeRow[];
    const { kept, removed } = dedupeRecipes(recipes);

    if (removed.length === 0) {
      console.log(`  ${book.slug.padEnd(40)} ${recipes.length.toString().padStart(4)} recipes — clean`);
      continue;
    }

    booksAffected++;
    totalRemoved += removed.length;

    console.log(
      `  ${book.slug.padEnd(40)} ${recipes.length.toString().padStart(4)} → ${kept.length} (-${removed.length})`
    );

    // Show a few examples so the user can sanity check.
    for (const r of removed.slice(0, 3)) {
      console.log(`      drop: "${r.recipe_title}"${r.page_number ? ` p.${r.page_number}` : ''}`);
    }
    if (removed.length > 3) console.log(`      … ${removed.length - 3} more`);

    if (dryRun) continue;

    // Delete the redundant rows in chunks (Supabase IN-list limit safety).
    const idsToDelete = removed.map((r) => r.id);
    const CHUNK = 200;
    for (let i = 0; i < idsToDelete.length; i += CHUNK) {
      const chunk = idsToDelete.slice(i, i + CHUNK);
      const { error: deleteError } = await supabase.from('recipes').delete().in('id', chunk);
      if (deleteError) {
        console.error(`      delete failed: ${deleteError.message}`);
        process.exit(1);
      }
    }

    // Sync recipe_count.
    const { error: countError } = await supabase
      .from('books')
      .update({ recipe_count: kept.length })
      .eq('id', book.id);
    if (countError) console.warn(`      recipe_count update failed: ${countError.message}`);
  }

  console.log(
    `\n${dryRun ? 'Would remove' : 'Removed'} ${totalRemoved} duplicate${totalRemoved === 1 ? '' : 's'} across ${booksAffected} book${booksAffected === 1 ? '' : 's'}.${dryRun ? ' Re-run without --dry-run to apply.' : ''}`
  );
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
