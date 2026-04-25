import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import heicConvert from 'heic-convert';

export const runtime = 'nodejs';

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

async function toJpegBase64(file: File): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const isHeic = name.endsWith('.heic') || name.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif';

  let inputBuffer = bytes;

  if (isHeic) {
    // Pass the Buffer directly — heic-convert needs an iterable (Uint8Array/Buffer), not a raw ArrayBuffer
    const outputBuffer = await heicConvert({ buffer: bytes as unknown as ArrayBuffer, format: 'JPEG', quality: 0.9 });
    inputBuffer = Buffer.from(outputBuffer);
  }

  // .rotate() applies EXIF orientation so Claude sees the image upright
  const processed = await sharp(inputBuffer)
    .rotate()
    .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return processed.toString('base64');
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

function regexExtractRecipes(text: string): RawRecipe[] {
  // Fallback: pull individual recipe objects out even if outer JSON is broken/truncated
  const results: RawRecipe[] = [];
  const re = /"recipe_title"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"page_number"\s*:\s*(\d+|null)\s*,\s*"category"\s*:\s*(?:"((?:[^"\\]|\\.)*)"|null)/g;
  for (const m of text.matchAll(re)) {
    results.push({
      recipe_title: m[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim(),
      page_number: m[2] === 'null' ? null : parseInt(m[2], 10),
      category: m[3] ? m[3].replace(/\\"/g, '"').trim() : null,
    });
  }
  return results;
}

function extractRecipes(text: string, label: string): RawRecipe[] {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Attempt 1: parse the whole cleaned text
  for (const candidate of [cleaned, (() => {
    const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}');
    return s !== -1 && e > s ? cleaned.substring(s, e + 1) : null;
  })()] as (string | null)[]) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && Array.isArray(parsed.recipes)) {
        return parsed.recipes
          .filter((r: unknown) => r && typeof (r as RawRecipe).recipe_title === 'string')
          .map((r: RawRecipe) => ({
            recipe_title: String(r.recipe_title).trim(),
            page_number: typeof r.page_number === 'number' ? r.page_number : null,
            category: r.category ? String(r.category).trim() : null,
          }));
      }
    } catch { /* try next */ }
  }

  // Attempt 2: regex scrape individual recipe objects — survives truncation and extra text
  console.warn(`[ingest][${label}] JSON parse failed, falling back to regex extraction. First 100 chars: "${cleaned.slice(0, 100)}"`);
  const regexResults = regexExtractRecipes(cleaned);
  if (regexResults.length > 0) return regexResults;

  console.error(`[ingest][${label}] regex extraction also found nothing. Full response:\n${cleaned}`);
  return [];
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params; // validate route param exists

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  const formData = await req.formData();
  const files = formData.getAll('images') as File[];

  if (!files.length) {
    return NextResponse.json({ error: 'No images provided' }, { status: 400 });
  }

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  for (const file of files) {
    const name = file.name.toLowerCase();
    const isHeic = name.endsWith('.heic') || name.endsWith('.heif');
    if (!allowed.includes(file.type) && !isHeic) {
      return NextResponse.json(
        { error: `File "${file.name}" must be JPG, PNG, WebP, or HEIC` },
        { status: 400 }
      );
    }
  }

  const allRecipes: RawRecipe[] = [];
  const errors: string[] = [];
  const rawResponses: { file: string; text: string }[] = [];
  const fileInfo = files.map((f) => `${f.name} (${f.type || 'no-mime'}, ${f.size}B)`);

  for (const file of files) {
    try {
      const base64 = await toJpegBase64(file);

      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
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

      const recipes = extractRecipes(rawText, file.name);
      console.log(`[ingest] ${file.name}: ${rawText.length} chars → ${recipes.length} recipes`);
      allRecipes.push(...recipes);
      // Store full raw response for debugging (no truncation)
      rawResponses.push({ file: file.name, text: rawText });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${file.name} (${file.type || 'no-mime'}, ${file.size}B): ${msg}`);
      console.error(`[ingest] error processing ${file.name}:`, err);
    }
  }

  const recipes = dedupeRecipes(allRecipes);

  return NextResponse.json({
    recipes,
    images_processed: files.length - errors.length,
    errors: errors.length ? errors : undefined,
    debug: rawResponses,
    file_info: fileInfo.join(', '),
  });
}
