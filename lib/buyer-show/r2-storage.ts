import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import type { UploadedAssetType } from './schemas';

const uploadUrlExpiresInSeconds = 15 * 60;
const readUrlExpiresInSeconds = 60 * 60;
const maxImageUploadBytes = 5 * 1024 * 1024;
const allowedImageContentTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

type CreateR2UploadUrlInput = {
  assetType: UploadedAssetType;
  fileName: string;
  contentType: string;
  byteSize: number;
};

let cachedClient: S3Client | undefined;

function getR2Config() {
  const accountId = readRequiredEnv('R2_ACCOUNT_ID');
  return {
    accountId,
    accessKeyId: readRequiredEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: readRequiredEnv('R2_SECRET_ACCESS_KEY'),
    bucket: readRequiredEnv('R2_BUCKET'),
    uploadPrefix: stripSlashes(process.env.R2_UPLOAD_PREFIX || 'tmp/buyer-show'),
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function getR2Client() {
  if (cachedClient) return cachedClient;

  const config = getR2Config();
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return cachedClient;
}

export async function createR2UploadUrl(input: CreateR2UploadUrlInput) {
  const contentType = normalizeImageContentType(input.contentType);
  if (!contentType) {
    throw new Error('只允许上传 JPG、PNG 或 WebP 图片');
  }

  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0 || input.byteSize > maxImageUploadBytes) {
    throw new Error('图片上传大小不能超过 5MB');
  }

  const config = getR2Config();
  const key = buildBuyerShowAssetKey({
    assetType: input.assetType,
    contentType,
    fileName: input.fileName,
    uploadPrefix: config.uploadPrefix,
  });
  const uploadUrl = await getSignedUrl(
    getR2Client(),
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: uploadUrlExpiresInSeconds },
  );

  return {
    key,
    uploadUrl,
    contentType,
    expiresIn: uploadUrlExpiresInSeconds,
  };
}

export async function createR2ReadUrl(key: string) {
  assertSafeObjectKey(key);
  const config = getR2Config();
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }),
    { expiresIn: readUrlExpiresInSeconds },
  );
}

export async function deleteR2Object(key: string) {
  assertSafeObjectKey(key);
  const config = getR2Config();
  await getR2Client().send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }),
  );
}

export function normalizeImageContentType(contentType: string) {
  const normalized = contentType.trim().toLowerCase();
  return allowedImageContentTypes.has(normalized) ? normalized : undefined;
}

function buildBuyerShowAssetKey({
  assetType,
  contentType,
  fileName,
  uploadPrefix,
}: {
  assetType: UploadedAssetType;
  contentType: string;
  fileName: string;
  uploadPrefix: string;
}) {
  const date = new Date().toISOString().slice(0, 10);
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const safeName = stripExtension(fileName).replace(/[^\w.-]+/g, '_').slice(0, 48) || 'upload';
  return `${uploadPrefix}/${date}/${assetType}/${randomUUID()}-${safeName}.${extension}`;
}

function assertSafeObjectKey(key: string) {
  if (!key || key.startsWith('/') || key.includes('..')) {
    throw new Error('Invalid R2 object key');
  }
}

function stripExtension(fileName: string) {
  return fileName.trim().replace(/\.[^.]+$/, '');
}

function stripSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '');
}
