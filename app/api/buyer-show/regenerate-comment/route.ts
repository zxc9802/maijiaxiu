import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateCommentForLanguage } from '@/lib/buyer-show/generation-service';
import { languageCodeSchema, productInfoSchema } from '@/lib/buyer-show/schemas';

const regenerateCommentSchema = z.object({
  productInfo: productInfoSchema,
  language: languageCodeSchema,
  setId: z.string().default('comment'),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = regenerateCommentSchema.parse(body);
    const comment = await generateCommentForLanguage(input.productInfo, input.language, input.setId);
    return NextResponse.json({ ok: true, comment });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 400 });
  }
}
