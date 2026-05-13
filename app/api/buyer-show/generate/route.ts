import { NextResponse } from 'next/server';
import { buyerShowErrorResponse, readCurrentBuyerShowUser } from '@/lib/buyer-show/auth';
import { createBuyerShowGenerationJob, scheduleBuyerShowGenerationJob } from '@/lib/buyer-show/generation-job-store';
import { generateRequestSchema } from '@/lib/buyer-show/schemas';

export async function POST(request: Request) {
  try {
    const user = await readCurrentBuyerShowUser(request);
    const body = await request.json();
    const input = generateRequestSchema.parse(body);
    const historyId = typeof body.historyId === 'string' ? body.historyId : undefined;
    const job = await createBuyerShowGenerationJob(user, input, historyId);

    scheduleBuyerShowGenerationJob(job.id);

    return NextResponse.json({ ok: true, jobId: job.id, job }, { status: 202 });
  } catch (error) {
    return buyerShowErrorResponse(error);
  }
}
