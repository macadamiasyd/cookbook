# Cookbook Search

AI-powered recipe search across a personal cookbook collection. Uses Claude's knowledge of published cookbooks to find recipes by query, returning recipe title, book, and approximate page number.

## Stack

- Next.js 14 (App Router)
- TypeScript + Tailwind
- Anthropic SDK (server-side, no CORS)
- Hardcoded book list in `data/books.json`

## Setup

```bash
npm install
cp .env.local.example .env.local
# Edit .env.local and add your ANTHROPIC_API_KEY
npm run dev
```

Then open http://localhost:3000.

Get an API key from https://console.anthropic.com.

## Editing your collection

Edit `data/books.json`. Each entry needs:

```json
{
  "id": "unique-slug",
  "title": "Book Title",
  "author": "Author Name",
  "year": 2020,
  "cover": "https://covers.openlibrary.org/..."
}
```

`cover` can be empty — the UI handles missing covers. To find covers, search Google Books for the title and grab the image URL, or leave blank.

## How it works

1. UI sends query to `/api/search`
2. Server-side route calls Claude with the full book list and query
3. Claude returns up to 12 matches as JSON: book_id, recipe title, page number, confidence
4. UI renders results with cover, title, page number, and confidence badge

## Known limitations

- Page numbers are approximate. Claude's recall is good for famous cookbooks (Ottolenghi, Nigella, Roman) and weak for obscure or regional titles.
- The `confidence` field is the model's self-assessment — treat it as a hint, not gospel.
- Each search is a fresh API call (~$0.01–0.03). No caching yet.

## Next steps if you want to extend this

- Move the book list to Supabase
- Add a "verified / wrong" feedback button to track accuracy and feed back into the prompt
- Index the actual back-of-book index pages via OCR for accurate page lookups
- Add cover images via a one-time Google Books API fetch script
