import { withUsageUser } from '@/lib/buyer-show/usage-monitor';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buyerShowErrorResponse, readCurrentBuyerShowUser } from '@/lib/buyer-show/auth';
import { generateCommentForLanguage } from '@/lib/buyer-show/generation-service';
import { languageCodeSchema, productInfoSchema } from '@/lib/buyer-show/schemas';

const regenerateCommentSchema = z.object({
  productInfo: productInfoSchema,
  language: languageCodeSchema,
  setId: z.string().default('comment'),
});

export async function POST(request: Request) {
  try {
    const user = await readCurrentBuyerShowUser(request);
    const body = await request.json();
    const input = regenerateCommentSchema.parse(body);
    const comment = await withUsageUser(user, () => generateCommentForLanguage(input.productInfo, input.language, input.setId));
    return NextResponse.json({ ok: true, comment });
  } catch (error) {
    return buyerShowErrorResponse(error);
  }
}
