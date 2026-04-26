// Vercel's edge layer rejects request bodies > 4.5 MB before they reach the function,
// so we resize + compress in the browser. iPhone photos are 5–10 MB raw.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function decodeImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    img.src = url;
  });
}

export interface CompressOptions {
  // Largest dimension to try first; the function steps down if the result is too large.
  steps?: ReadonlyArray<readonly [number, number]>; // [maxDim, jpegQuality]
}

const COVER_STEPS = [[1600, 0.85], [1280, 0.8], [1024, 0.75], [800, 0.7]] as const;

export async function compressImageForUpload(file: File, options: CompressOptions = {}): Promise<Blob> {
  const steps = options.steps ?? COVER_STEPS;

  let img: HTMLImageElement;
  try {
    img = await decodeImage(file);
  } catch {
    // Browser can't decode (e.g. HEIC on non-Apple). Send raw if it'll fit; otherwise bail.
    if (file.size <= MAX_UPLOAD_BYTES) return file;
    throw new Error(`Can't process this image in your browser and it's ${(file.size / 1024 / 1024).toFixed(1)} MB (limit 4 MB). Try a JPG/PNG export.`);
  }

  for (const [maxDim, quality] of steps) {
    const ratio = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * ratio);
    canvas.height = Math.round(img.naturalHeight * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not available');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
    if (blob && blob.size <= MAX_UPLOAD_BYTES) return blob;
  }
  throw new Error('Image is too large to upload even after compression.');
}

// OCR needs higher resolution to read text reliably; cover thumbnails don't.
export const OCR_STEPS = [[2200, 0.88], [1800, 0.85], [1400, 0.8], [1100, 0.75]] as const;
