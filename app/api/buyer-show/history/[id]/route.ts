import { z } from 'zod';
import { buyerShowErrorResponse, readCurrentBuyerShowUser } from '@/lib/buyer-show/auth';
import {
  deleteBuyerShowHistory,
  getBuyerShowHistory,
  upsertBuyerShowHistory,
} from '@/lib/buyer-show/history-store';
import { generateRequestSchema, generatedResultSchema } from '@/lib/buyer-show/schemas';

const historyPatchSchema = z.object({
  productInfo: generateRequestSchema.shape.productInfo,
  generationSets: generateRequestSchema.shape.generationSets,
  results: z.array(generatedResultSchema),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function readHistoryId(context: RouteContext) {
  const params = await context.params;
  return params.id;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await readCurrentBuyerShowUser(request);
    const id = await readHistoryId(context);
    const item = await getBuyerShowHistory(user, id);
    if (!item) {
      return Response.json({ ok: false, error: 'History record not found' }, { status: 404 });
    }
    return Response.json({ ok: true, item });
  } catch (error) {
    return buyerShowErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await readCurrentBuyerShowUser(request);
    const id = await readHistoryId(context);
    const body = await request.json();
    const input = historyPatchSchema.parse(body);
    const item = await upsertBuyerShowHistory(user, { ...input, historyId: id });
    return Response.json({ ok: true, item });
  } catch (error) {
    return buyerShowErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await readCurrentBuyerShowUser(request);
    const id = await readHistoryId(context);
    const deleted = await deleteBuyerShowHistory(user, id);
    if (!deleted) {
      return Response.json({ ok: false, error: 'History record not found' }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return buyerShowErrorResponse(error);
  }
}
