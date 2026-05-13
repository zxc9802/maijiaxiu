import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buyerShowErrorResponse, readCurrentBuyerShowUser } from '@/lib/buyer-show/auth';
import { buildImagePrompt, resolveUploadedAssetImageUrls } from '@/lib/buyer-show/generation-service';
import { generateBuyerShowImage } from '@/lib/buyer-show/image-provider';
import {
  imageTypeSchema,
  personProfileSchema,
  productInfoSchema,
  sceneElementSchema,
  seasonClimateSchema,
  uploadedAssetSchema,
} from '@/lib/buyer-show/schemas';

const regenerateImageSchema = z.object({
  productInfo: productInfoSchema,
  imageType: imageTypeSchema,
  personProfile: personProfileSchema.default('southeast_asia_asian'),
  sceneElement: sceneElementSchema.default('dressing_table'),
  seasonClimate: seasonClimateSchema.default('spring_autumn'),
  imageUrls: z.array(z.string()).default([]),
  assets: z.array(uploadedAssetSchema).default([]),
});

export async function POST(request: Request) {
  try {
    await readCurrentBuyerShowUser(request);
    const body = await request.json();
    const input = regenerateImageSchema.parse(body);
    const imageUrls = [...input.imageUrls, ...(await resolveUploadedAssetImageUrls(input.assets))];
    const image = await generateBuyerShowImage({
      imageType: input.imageType,
      imageUrls,
      prompt: buildImagePrompt(input.productInfo, input.imageType, input.personProfile, input.sceneElement, input.seasonClimate),
    });
    return NextResponse.json({ ok: true, image });
  } catch (error) {
    return buyerShowErrorResponse(error);
  }
}
