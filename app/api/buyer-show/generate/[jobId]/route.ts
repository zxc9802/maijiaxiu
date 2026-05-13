import { buyerShowErrorResponse, readCurrentBuyerShowUser } from '@/lib/buyer-show/auth';
import { getBuyerShowGenerationJob, scheduleBuyerShowGenerationJob } from '@/lib/buyer-show/generation-job-store';

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const user = await readCurrentBuyerShowUser(request);
    const { jobId } = await params;
    const job = await getBuyerShowGenerationJob(user, jobId);

    if (!job) {
      return Response.json({ ok: false, error: 'Generation job not found' }, { status: 404 });
    }

    if (job.status === 'queued') {
      scheduleBuyerShowGenerationJob(job.id);
    }

    return Response.json({ ok: true, job });
  } catch (error) {
    return buyerShowErrorResponse(error);
  }
}
