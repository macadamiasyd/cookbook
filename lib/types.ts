export interface Book {
  id: string;
  slug: string;
  title: string;
  author: string;
  year: number | null;
  isbn: string | null;
  cover_url: string | null;
  publisher: string | null;
  notes: string | null;
  created_at: string;
}

export interface RecipeMatch {
  book_id: string;
  recipe_title: string;
  page_number: number | null;
  confidence: 'high' | 'medium' | 'low';
  note?: string;
}

export interface SearchResponse {
  results: RecipeMatch[];
  error?: string;
}

export interface IsbnLookupResult {
  title: string;
  author: string;
  year: number | null;
  publisher: string | null;
  cover_url: string | null;
  isbn: string;
}
