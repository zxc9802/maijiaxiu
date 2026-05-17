import type { Prisma } from '@prisma/client';
import { prisma, withPrismaRetry } from './prisma';
import type { BuyerShowUser } from './auth';
import { createHistoryTitle } from './history-labels';
import type { GeneratedImage, GeneratedResult, GenerateRequest, ProductInfo } from './schemas';

const HISTORY_RETENTION_DAYS = 30;

type HistoryPayload = {
  historyId?: string;
  productInfo: ProductInfo;
  generationSets: GenerateRequest['generationSets'];
  results: GeneratedResult[];
};

function addRetentionWindow(date = new Date()) {
  return new Date(date.getTime() + HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

function isPersistentImageUrl(value: string | undefined) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function sanitizeImageForHistory(image: GeneratedImage): GeneratedImage {
  return {
    ...image,
    url: isPersistentImageUrl(image.url) ? image.url : undefined,
    localImageKey: undefined,
  };
}

export function sanitizeResultsForHistory(results: GeneratedResult[]): GeneratedResult[] {
  return results.map((result) => ({
    ...result,
    images: result.images.map(sanitizeImageForHistory),
  }));
}

function toJsonValue<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function serializeHistoryRecord(record: {
  id: string;
  title: string;
  productName: string | null;
  category: string | null;
  productInfo: Prisma.JsonValue;
  generationSets: Prisma.JsonValue;
  results: Prisma.JsonValue;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}) {
  return {
    id: record.id,
    title: record.title,
    productName: record.productName,
    category: record.category,
    productInfo: record.productInfo,
    generationSets: record.generationSets,
    results: record.results,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
  };
}

function buildHistoryData(user: BuyerShowUser, payload: HistoryPayload) {
  const results = sanitizeResultsForHistory(payload.results);
  const status = results.some((result) => result.comments.some((comment) => comment.complianceStatus === 'checking'))
    ? 'checking'
    : results.some((result) => result.comments.some((comment) => comment.complianceStatus === 'needs_review'))
      ? 'needs_review'
      : 'passed';

  return {
    userId: user.userId,
    userSnapshot: toJsonValue(user),
    title: createHistoryTitle({
      productInfo: payload.productInfo,
      generationSets: payload.generationSets,
      results,
      status,
    }),
    productName: payload.productInfo.productName?.trim() || null,
    category: payload.productInfo.category || null,
    productInfo: toJsonValue(payload.productInfo),
    generationSets: toJsonValue(payload.generationSets),
    results: toJsonValue(results),
    status,
    schemaVersion: 1,
    expiresAt: addRetentionWindow(),
    deletedAt: null,
  };
}

export async function upsertBuyerShowHistory(user: BuyerShowUser, payload: HistoryPayload) {
  return withPrismaRetry(async (client) => {
    const data = buildHistoryData(user, payload);

    if (payload.historyId) {
      const existing = await client.buyerShowHistory.findFirst({
        where: { id: payload.historyId, userId: user.userId, deletedAt: null },
        select: { id: true },
      });

      if (existing) {
        const updated = await client.buyerShowHistory.update({
          where: { id: existing.id },
          data,
        });
        return serializeHistoryRecord(updated);
      }
    }

    const created = await client.buyerShowHistory.create({ data });
    return serializeHistoryRecord(created);
  });
}

export async function listBuyerShowHistory(user: BuyerShowUser, limit = 20) {
  return withPrismaRetry(async (client) => {
    const records = await client.buyerShowHistory.findMany({
      where: {
        userId: user.userId,
        deletedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(50, limit)),
    });

    return records.map(serializeHistoryRecord);
  });
}

export async function getBuyerShowHistory(user: BuyerShowUser, id: string) {
  return withPrismaRetry(async (client) => {
    const record = await client.buyerShowHistory.findFirst({
      where: {
        id,
        userId: user.userId,
        deletedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    return record ? serializeHistoryRecord(record) : null;
  });
}

export async function deleteBuyerShowHistory(user: BuyerShowUser, id: string) {
  return withPrismaRetry(async (client) => {
    const result = await client.buyerShowHistory.updateMany({
      where: { id, userId: user.userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    return result.count > 0;
  });
}
