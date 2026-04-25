import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import heicConvert from 'heic-convert';
import { createServerClient } from '@/lib/supabase';
import { uploadCover } from '@/lib/storage';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    return await handlePost(req, params);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cover] unhandled error:', err);
    return NextResponse.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}

async function handlePost(
  req: NextRequest,
  params: Promise<{ id: string }>
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

  const name = file.name.toLowerCase();
  const isHeic =
    name.endsWith('.heic') ||
    name.endsWith('.heif') ||
    file.type === 'image/heic' ||
    file.type === 'image/heif';
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  if (!allowed.includes(file.type) && !isHeic) {
    return NextResponse.json(
      { error: `Only JPG, PNG, WebP, or HEIC accepted (got: ${file.type || 'no type'})` },
      { status: 400 }
    );
  }

  let bytes = Buffer.from(await file.arrayBuffer());
  console.log(`[cover] file: ${name} type=${file.type} size=${bytes.length} isHeic=${isHeic}`);

  if (isHeic) {
    const outputBuffer = await heicConvert({
      buffer: bytes as unknown as ArrayBuffer,
      format: 'JPEG',
      quality: 0.9,
    });
    bytes = Buffer.from(outputBuffer);
    console.log(`[cover] HEIC→JPEG: ${bytes.length} bytes`);
  }

  const publicUrl = await uploadCover(book.slug, bytes);
  console.log(`[cover] uploaded: ${publicUrl}`);

  const { error: updateError } = await supabase
    .from('books')
    .update({ cover_url: publicUrl })
    .eq('id', id);

  if (updateError) {
    console.error('[cover] DB update failed:', updateError.message);
    return NextResponse.json({ error: `DB update failed: ${updateError.message}` }, { status: 500 });
  }

  revalidatePath(`/books/${book.slug}`);
  return NextResponse.json({ cover_url: publicUrl });
}
