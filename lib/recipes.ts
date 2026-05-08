export interface DedupeRecipe {
  recipe_title: string;
  page_number: number | null;
}

// Normalise for comparison: lowercase, strip diacritics, replace punctuation with
// spaces, collapse whitespace. Keeps the alphanumerics and the word boundaries.
function normalizeForCompare(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Token-set key — sort the words alphabetically so reordered titles collide.
// "Tikka Masala Roast Chicken" and "Roast Chicken, Tikka Masala" → same key.
function tokenSetKey(title: string): string {
  return normalizeForCompare(title).split(' ').filter(Boolean).sort().join(' ');
}

function dedupeKey(r: DedupeRecipe): string {
  return `${tokenSetKey(r.recipe_title)}|${r.page_number ?? ''}`;
}

// When two titles collide, prefer the more "natural" one. Index inversions
// like "Roast Chicken, Tikka Masala" lead with a comma-separated reorder;
// the original recipe title doesn't.
function preferA(a: string, b: string): boolean {
  const aComma = a.includes(',');
  const bComma = b.includes(',');
  if (aComma !== bComma) return !aComma;
  // Tiebreak: prefer the longer one (more descriptive).
  return a.length > b.length;
}

export interface DedupeResult<R> {
  kept: R[];
  removed: R[];
}

// Dedupe a list of recipes by token-set + page_number. Stable: when collisions
// happen, the first-seen entry wins unless a later entry is a clearer title.
export function dedupeRecipes<R extends DedupeRecipe>(recipes: R[]): DedupeResult<R> {
  const winners = new Map<string, R>();
  const order: string[] = [];

  for (const r of recipes) {
    const k = dedupeKey(r);
    const existing = winners.get(k);
    if (!existing) {
      winners.set(k, r);
      order.push(k);
    } else if (preferA(r.recipe_title, existing.recipe_title)) {
      winners.set(k, r);
    }
  }

  const keptSet = new Set(winners.values());
  const kept: R[] = order.map((k) => winners.get(k)!);
  const removed = recipes.filter((r) => !keptSet.has(r));
  return { kept, removed };
}
