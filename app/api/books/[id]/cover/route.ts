import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { uploadCover } from '@/lib/storage';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = createServerClient();
  const { data: book, error: fetchError } = await supabase
    .from('books')
    .select('id, slug')
    .eq('id', id)
    .single();

  if (fetchError || !book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPG, PNG or WebP accepted' }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    const publicUrl = await uploadCover(book.slug, bytes);

    const { error: updateError } = await supabase
      .from('books')
      .update({ cover_url: publicUrl })
      .eq('id', id);

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({ cover_url: publicUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
