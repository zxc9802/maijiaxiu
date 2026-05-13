import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkCommentCompliance } from '@/lib/buyer-show/generation-service';
import { languageCodeSchema } from '@/lib/buyer-show/schemas';

const complianceCheckSchema = z.object({
  comment: z.string().min(1),
  language: languageCodeSchema,
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = complianceCheckSchema.parse(body);
    const compliance = await checkCommentCompliance(input.comment, input.language);
    return NextResponse.json({ ok: true, compliance });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 400 });
  }
}
