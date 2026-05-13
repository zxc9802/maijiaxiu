import type { Prisma } from '@prisma/client';
import { completeMissingProductInfo, generateBuyerShowResults } from './generation-service';
import { withPrismaRetry } from './prisma';
import { generateRequestSchema, type GeneratedResult, type GenerateRequest, type ProductInfo } from './schemas';
import type { BuyerShowUser } from './auth';

export type BuyerShowGenerationJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type BuyerShowGenerationJobSnapshot = {
  id: string;
  status: BuyerShowGenerationJobStatus;
  progress: number;
  productInfo?: ProductInfo;
  results?: GeneratedResult[];
  historyId?: string;
  historyError?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
};

type GenerationJobRecord = {
  id: string;
  status: string;
  progress: number;
  productInfo: Prisma.JsonValue | null;
  results: Prisma.JsonValue | null;
  historyId: string | null;
  historyError: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

type BuyerShowGenerationJobGlobalState = {
  buyerShowGenerationJobs?: Map<string, Promise<void>>;
};

const globalForGenerationJobs = globalThis as unknown as BuyerShowGenerationJobGlobalState;

function getRunningJobs() {
  if (!globalForGenerationJobs.buyerShowGenerationJobs) {
    globalForGenerationJobs.buyerShowGenerationJobs = new Map();
  }
  return globalForGenerationJobs.buyerShowGenerationJobs;
}

function toJsonValue<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function serializeGenerationJob(record: GenerationJobRecord): BuyerShowGenerationJobSnapshot {
  return {
    id: record.id,
    status: normalizeGenerationJobStatus(record.status),
    progress: record.progress,
    productInfo: record.productInfo ? (record.productInfo as ProductInfo) : undefined,
    results: record.results ? (record.results as GeneratedResult[]) : undefined,
    historyId: record.historyId || undefined,
    historyError: record.historyError || undefined,
    error: record.error || undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    startedAt: record.startedAt?.toISOString(),
    finishedAt: record.finishedAt?.toISOString(),
  };
}

function normalizeGenerationJobStatus(status: string): BuyerShowGenerationJobStatus {
  if (status === 'processing' || status === 'completed' || status === 'failed') return status;
  return 'queued';
}

async function updateJobProgress(jobId: string, progress: number) {
  await withPrismaRetry((client) =>
    client.buyerShowGenerationJob.update({
      where: { id: jobId },
      data: { progress },
    }),
  );
}

export async function createBuyerShowGenerationJob(user: BuyerShowUser, request: GenerateRequest) {
  return withPrismaRetry(async (client) => {
    const job = await client.buyerShowGenerationJob.create({
      data: {
        userId: user.userId,
        userSnapshot: toJsonValue(user),
        request: toJsonValue(request),
        status: 'queued',
        progress: 0,
      },
    });

    return serializeGenerationJob(job);
  });
}

export async function getBuyerShowGenerationJob(user: BuyerShowUser, jobId: string) {
  return withPrismaRetry(async (client) => {
    const job = await client.buyerShowGenerationJob.findFirst({
      where: {
        id: jobId,
        userId: user.userId,
      },
    });

    return job ? serializeGenerationJob(job) : null;
  });
}

export function scheduleBuyerShowGenerationJob(jobId: string) {
  const runningJobs = getRunningJobs();
  if (runningJobs.has(jobId)) return;

  const jobPromise = runBuyerShowGenerationJob(jobId)
    .catch((error) => {
      console.error('[buyer-show-generation-job] Unhandled job failure', error);
    })
    .finally(() => {
      runningJobs.delete(jobId);
    });

  runningJobs.set(jobId, jobPromise);
}

export async function runBuyerShowGenerationJob(jobId: string) {
  const claimedJob = await withPrismaRetry(async (client) => {
    const updateResult = await client.buyerShowGenerationJob.updateMany({
      where: { id: jobId, status: 'queued' },
      data: {
        status: 'processing',
        progress: 5,
        startedAt: new Date(),
        error: null,
      },
    });

    if (updateResult.count !== 1) return null;

    return client.buyerShowGenerationJob.findUnique({ where: { id: jobId } });
  });

  if (!claimedJob) return;

  try {
    const request = generateRequestSchema.parse(claimedJob.request);

    await updateJobProgress(jobId, 15);
    const productInfo = await completeMissingProductInfo(request.productInfo, request.assets);

    await updateJobProgress(jobId, 35);
    const results = await generateBuyerShowResults({ ...request, productInfo });

    await updateJobProgress(jobId, 85);
    await withPrismaRetry((client) =>
      client.buyerShowGenerationJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          progress: 100,
          productInfo: toJsonValue(productInfo),
          results: toJsonValue(results),
          historyError: null,
          error: null,
          finishedAt: new Date(),
        },
      }),
    );
  } catch (error) {
    await withPrismaRetry((client) =>
      client.buyerShowGenerationJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          progress: 100,
          error: error instanceof Error ? error.message : '生成失败，请稍后重试',
          finishedAt: new Date(),
        },
      }),
    );
  }
}
