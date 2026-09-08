import { runWithUsageUser } from '@/lib/buyer-show/main-usage';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buyerShowErrorResponse, readCurrentBuyerShowUser } from '@/lib/buyer-show/auth';
import { buildImagePrompt, hasUploadedPackageAsset, resolveUploadedAssetImageUrls } from '@/lib/buyer-show/generation-service';
import { generateBuyerShowImage } from '@/lib/buyer-show/image-provider';
import {
  imageTypeSchema,
  personGenderSchema,
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
  personGender: personGenderSchema.default('female'),
  sceneElement: sceneElementSchema.default('dressing_table'),
  seasonClimate: seasonClimateSchema.default('spring_autumn'),
  imageUrls: z.array(z.string()).default([]),
  assets: z.array(uploadedAssetSchema).default([]),
});

async function handleUsagePost(request: Request) {
  try {
    await readCurrentBuyerShowUser(request);
    const body = await request.json();
    const input = regenerateImageSchema.parse(body);
    const imageUrls = [...input.imageUrls, ...(await resolveUploadedAssetImageUrls(input.assets))];
    const image = await generateBuyerShowImage({
      imageType: input.imageType,
      imageUrls,
      prompt: buildImagePrompt(
        input.productInfo,
        input.imageType,
        input.personProfile,
        input.sceneElement,
        input.seasonClimate,
        0,
        input.personGender,
        { hasPackageAsset: hasUploadedPackageAsset(input.assets) },
      ),
    });
    return NextResponse.json({ ok: true, image });
  } catch (error) {
    return buyerShowErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await readCurrentBuyerShowUser(request);
    return await runWithUsageUser(user.userId, () => handleUsagePost(request));
  } catch (error) {
    return buyerShowErrorResponse(error);
  }
}
