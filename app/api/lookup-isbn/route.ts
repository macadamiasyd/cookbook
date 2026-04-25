import { NextRequest, NextResponse } from 'next/server';
import { lookupIsbn } from '@/lib/google-books';

export async function GET(req: NextRequest) {
  const isbn = req.nextUrl.searchParams.get('isbn');
  if (!isbn) {
    return NextResponse.json({ error: 'isbn parameter required' }, { status: 400 });
  }

  try {
    const result = await lookupIsbn(isbn);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Lookup failed';
    const status = message.includes('No book found') ? 404 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
