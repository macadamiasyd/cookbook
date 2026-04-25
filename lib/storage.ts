import sharp from 'sharp';
import { createServerClient } from './supabase';

const BUCKET = 'book-covers';

export function isStorageUrl(url: string): boolean {
  return url.includes('/storage/v1/object/public/');
}

export async function downloadImageBytes(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function resizeImage(bytes: Buffer, maxWidth = 600): Promise<Buffer> {
  return sharp(bytes)
    .rotate()
    .resize(maxWidth, undefined, { withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

export async function uploadCover(slug: string, bytes: Buffer): Promise<string> {
  const resized = await resizeImage(bytes);
  const supabase = createServerClient();
  const key = `${slug}.jpg`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(key, resized, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return data.publicUrl;
}

export async function downloadAndUploadCover(
  slug: string,
  remoteUrl: string
): Promise<string> {
  const bytes = await downloadImageBytes(remoteUrl);
  return uploadCover(slug, bytes);
}
