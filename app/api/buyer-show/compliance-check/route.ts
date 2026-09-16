import { withUsageUser } from '@/lib/buyer-show/usage-monitor';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buyerShowErrorResponse, readCurrentBuyerShowUser } from '@/lib/buyer-show/auth';
import { checkCommentCompliance } from '@/lib/buyer-show/generation-service';
import { languageCodeSchema } from '@/lib/buyer-show/schemas';

const complianceCheckSchema = z.object({
  comment: z.string().min(1),
  language: languageCodeSchema,
});

export async function POST(request: Request) {
  try {
    const user = await readCurrentBuyerShowUser(request);
    const body = await request.json();
    const input = complianceCheckSchema.parse(body);
    const compliance = await withUsageUser(user, () => checkCommentCompliance(input.comment, input.language));
    return NextResponse.json({ ok: true, compliance });
  } catch (error) {
    return buyerShowErrorResponse(error);
  }
}
