import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildImagePrompt } from '@/lib/buyer-show/generation-service';
import { generateBuyerShowImage } from '@/lib/buyer-show/image-provider';
import { imageTypeSchema, personEthnicitySchema, productInfoSchema } from '@/lib/buyer-show/schemas';

const regenerateImageSchema = z.object({
  productInfo: productInfoSchema,
  imageType: imageTypeSchema,
  personEthnicity: personEthnicitySchema.default('yellow'),
  imageUrls: z.array(z.string().url()).default([]),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = regenerateImageSchema.parse(body);
    const image = await generateBuyerShowImage({
      imageType: input.imageType,
      imageUrls: input.imageUrls,
      prompt: buildImagePrompt(input.productInfo, input.imageType, input.personEthnicity),
    });
    return NextResponse.json({ ok: true, image });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 400 });
  }
}
