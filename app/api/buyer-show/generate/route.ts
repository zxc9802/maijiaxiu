import { NextResponse } from 'next/server';
import { buyerShowErrorResponse, readCurrentBuyerShowUser } from '@/lib/buyer-show/auth';
import { completeMissingProductInfo, generateBuyerShowResults } from '@/lib/buyer-show/generation-service';
import { upsertBuyerShowHistory } from '@/lib/buyer-show/history-store';
import { generateRequestSchema } from '@/lib/buyer-show/schemas';

export async function POST(request: Request) {
  try {
    const user = await readCurrentBuyerShowUser(request);
    const body = await request.json();
    const input = generateRequestSchema.parse(body);
    const historyId = typeof body.historyId === 'string' ? body.historyId : undefined;
    const productInfo = await completeMissingProductInfo(input.productInfo, input.assets);
    const results = await generateBuyerShowResults({ ...input, productInfo });
    let savedHistoryId: string | undefined;
    let historyError: string | undefined;

    try {
      const history = await upsertBuyerShowHistory(user, {
        historyId,
        productInfo,
        generationSets: input.generationSets,
        results,
      });
      savedHistoryId = history.id;
    } catch (error) {
      historyError = error instanceof Error ? error.message : 'History save failed';
      console.error('[buyer-show-history] Failed to save generation history', error);
    }

    return NextResponse.json({ ok: true, productInfo, results, historyId: savedHistoryId, historyError });
  } catch (error) {
    return buyerShowErrorResponse(error);
  }
}
