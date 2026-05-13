import { NextResponse } from 'next/server';
import { buyerShowErrorResponse, readCurrentBuyerShowUser } from '@/lib/buyer-show/auth';

const defaultImageContentType = 'application/octet-stream';

export async function GET(request: Request) {
  try {
    await readCurrentBuyerShowUser(request);

    const requestUrl = new URL(request.url);
    const imageUrl = parseDownloadImageUrl(requestUrl.searchParams.get('url'));
    const filename = sanitizeAttachmentFilename(requestUrl.searchParams.get('filename'));
    const response = await fetch(imageUrl, { cache: 'no-store' });

    if (!response.ok || !response.body) {
      return NextResponse.json({ ok: false, error: '图片下载失败，请稍后重试' }, { status: response.status || 502 });
    }

    const headers = new Headers({
      'Cache-Control': 'no-store',
      'Content-Disposition': buildAttachmentDisposition(filename),
      'Content-Type': response.headers.get('Content-Type') || defaultImageContentType,
    });
    const contentLength = response.headers.get('Content-Length');

    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    return new Response(response.body, {
      headers,
      status: 200,
    });
  } catch (error) {
    return buyerShowErrorResponse(error);
  }
}

function parseDownloadImageUrl(value: string | null) {
  if (!value) {
    throw new Error('缺少图片下载地址');
  }

  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('只支持下载 HTTP 图片地址');
  }

  return url;
}

function sanitizeAttachmentFilename(value: string | null) {
  const fallback = 'buyer-show-image.png';
  const cleaned = (value || fallback).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim();

  return cleaned || fallback;
}

function buildAttachmentDisposition(filename: string) {
  const asciiFilename = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeRFC5987ValueChars(filename)}`;
}

function encodeRFC5987ValueChars(value: string) {
  return encodeURIComponent(value).replace(/['()]/g, escape).replace(/\*/g, '%2A');
}
