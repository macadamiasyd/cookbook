import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';

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

  if (isHeic) {
    // sharp on macOS/Vercel supports HEIC input via libvips HEIF
    const converted = await sharp(bytes).jpeg({ quality: 90 }).toBuffer();
    return converted.toString('base64');
  }

  // For JPG/PNG, still process through sharp to normalise and cap size
  const processed = await sharp(bytes)
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

function extractRecipes(text: string): RawRecipe[] {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(cleaned.substring(start, end + 1));
    if (!Array.isArray(parsed.recipes)) return [];
    return parsed.recipes
      .filter((r: unknown) => r && typeof (r as RawRecipe).recipe_title === 'string')
      .map((r: RawRecipe) => ({
        recipe_title: String(r.recipe_title).trim(),
        page_number: typeof r.page_number === 'number' ? r.page_number : null,
        category: r.category ? String(r.category).trim() : null,
      }));
  } catch {
    return [];
  }
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

  for (const file of files) {
    try {
      const base64 = await toJpegBase64(file);

      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
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

      const recipes = extractRecipes(rawText);
      allRecipes.push(...recipes);
    } catch (err) {
      errors.push(`${file.name}: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }

  const recipes = dedupeRecipes(allRecipes);

  return NextResponse.json({
    recipes,
    images_processed: files.length - errors.length,
    errors: errors.length ? errors : undefined,
  });
}
