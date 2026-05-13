import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buyerShowErrorResponse, readCurrentBuyerShowUser } from '@/lib/buyer-show/auth';
import { createR2UploadUrl } from '@/lib/buyer-show/r2-storage';
import { uploadedAssetTypeSchema } from '@/lib/buyer-show/schemas';

const signUploadRequestSchema = z.object({
  assetType: uploadedAssetTypeSchema,
  fileName: z.string().trim().min(1).max(180),
  contentType: z.string().trim().min(1).max(80),
  byteSize: z.number().int().positive().max(5 * 1024 * 1024),
});

export async function POST(request: Request) {
  try {
    await readCurrentBuyerShowUser(request);
    const input = signUploadRequestSchema.parse(await request.json());
    const upload = await createR2UploadUrl(input);
    return NextResponse.json({ ok: true, ...upload });
  } catch (error) {
    return buyerShowErrorResponse(error);
  }
}
