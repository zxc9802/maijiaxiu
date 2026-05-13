import { z } from 'zod';
import { buyerShowErrorResponse, readCurrentBuyerShowUser } from '@/lib/buyer-show/auth';
import { getBuyerShowHistory, listBuyerShowHistory, upsertBuyerShowHistory } from '@/lib/buyer-show/history-store';
import { generateRequestSchema, generatedResultSchema } from '@/lib/buyer-show/schemas';

const historyWriteSchema = z.object({
  historyId: z.string().optional(),
  productInfo: generateRequestSchema.shape.productInfo,
  generationSets: generateRequestSchema.shape.generationSets,
  results: z.array(generatedResultSchema),
});

export async function GET(request: Request) {
  try {
    const user = await readCurrentBuyerShowUser(request);
    const url = new URL(request.url);
    const limit = Number.parseInt(url.searchParams.get('limit') || '20', 10);
    const id = url.searchParams.get('id');

    if (id) {
      const record = await getBuyerShowHistory(user, id);
      if (!record) {
        return Response.json({ ok: false, error: 'History record not found' }, { status: 404 });
      }
      return Response.json({ ok: true, item: record });
    }

    const items = await listBuyerShowHistory(user, limit);
    return Response.json({ ok: true, items });
  } catch (error) {
    return buyerShowErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await readCurrentBuyerShowUser(request);
    const body = await request.json();
    const input = historyWriteSchema.parse(body);
    const item = await upsertBuyerShowHistory(user, input);
    return Response.json({ ok: true, item });
  } catch (error) {
    return buyerShowErrorResponse(error);
  }
}
