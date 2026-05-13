import { NextResponse } from 'next/server';
import { completeMissingProductInfo, generateBuyerShowResults } from '@/lib/buyer-show/generation-service';
import { generateRequestSchema } from '@/lib/buyer-show/schemas';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = generateRequestSchema.parse(body);
    const productInfo = await completeMissingProductInfo(input.productInfo, input.assets);
    const results = await generateBuyerShowResults({ ...input, productInfo });
    return NextResponse.json({ ok: true, productInfo, results });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 400 });
  }
}
