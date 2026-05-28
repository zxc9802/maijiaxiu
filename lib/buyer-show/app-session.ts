const DEFAULT_MAIN_APP_ENTRY_PATH = '/bot/buyer-show';
const DEFAULT_MAIN_APP_SSO_EXCHANGE_PATH = '/api/buyer-show-sso/exchange';
const DEFAULT_MAIN_APP_SESSION_PATH = '/api/sso/session';
const DEFAULT_SESSION_COOKIE_NAME = 'buyer_show_session';
const DEFAULT_SESSION_TTL_MINUTES = 720;
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

export type BuyerShowSessionUser = Record<string, unknown>;

export type BuyerShowSession = {
  token: string;
  user: BuyerShowSessionUser;
  mainAppUrl: string;
  expiresAt: number;
};

type BuyerShowSessionExchangeResult = {
  token: string;
  user: BuyerShowSessionUser;
  redirectPath: string;
};

type BuyerShowSessionCookie = {
  name: string;
  value: string;
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge: number;
  expires: Date;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production';
}

function readBooleanEnv(value: string | undefined, fallbackValue: boolean) {
  if (!value) return fallbackValue;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function stripTrailingSlash(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function normalizePath(value: string | undefined, fallbackValue: string) {
  const trimmed = value?.trim();
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return fallbackValue;
  }
  return trimmed;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function getConfiguredMainAppUrl() {
  const mainAppUrl = stripTrailingSlash(process.env.MAIN_APP_URL || '');
  if (mainAppUrl) {
    return mainAppUrl;
  }

  if (isMainAppSsoRequired()) {
    throw new Error('MAIN_APP_URL 未配置，开启主站 SSO 时必须提供主站地址。');
  }

  return '';
}

function getSessionSecret() {
  const secret = process.env.BUYER_SHOW_SESSION_SECRET?.trim() || process.env.BUYER_SHOW_SSO_SECRET?.trim();
  if (secret) {
    return secret;
  }
  if (!isProductionRuntime()) {
    return 'buyer-show-dev-session-secret';
  }
  throw new Error('BUYER_SHOW_SESSION_SECRET 未配置，开启主站 SSO 后必须提供会话签名密钥。');
}

function getSessionTtlMinutes() {
  const value = Number(process.env.BUYER_SHOW_SESSION_TTL_MINUTES || DEFAULT_SESSION_TTL_MINUTES);
  if (!Number.isFinite(value)) {
    return DEFAULT_SESSION_TTL_MINUTES;
  }
  return Math.max(5, Math.floor(value));
}

function getSessionTtlMs() {
  return getSessionTtlMinutes() * 60 * 1000;
}

function parseCookieHeader(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, item) => {
      const index = item.indexOf('=');
      if (index <= 0) return cookies;
      const key = item.slice(0, index).trim();
      const value = item.slice(index + 1).trim();
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function normalizeRedirectPath(value: unknown) {
  if (typeof value !== 'string') return '/';
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/';
  return trimmed;
}

function sanitizeMainAppUrl(value: string | null) {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    const requested = new URL(candidate);
    if (!['http:', 'https:'].includes(requested.protocol)) {
      return null;
    }

    const configuredMainAppUrl = getConfiguredMainAppUrl();
    if (configuredMainAppUrl) {
      const configured = new URL(configuredMainAppUrl);
      if (requested.origin === configured.origin) {
        return stripTrailingSlash(requested.origin);
      }
    }

    if (!isProductionRuntime() && LOCAL_HOSTNAMES.has(requested.hostname)) {
      return stripTrailingSlash(requested.origin);
    }
  } catch {
    return null;
  }

  return null;
}

async function signSessionPayload(payload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(getSessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

function signaturesMatch(expected: string, provided: string) {
  if (expected.length !== provided.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ provided.charCodeAt(index);
  }
  return mismatch === 0;
}

export function isMainAppSsoRequired() {
  return readBooleanEnv(process.env.REQUIRE_MAIN_APP_SSO, isProductionRuntime());
}

export function getMainAppEntryPath() {
  return normalizePath(
    process.env.MAIN_APP_BUYER_SHOW_ENTRY_PATH || process.env.MAIN_APP_BOT_ENTRY_PATH,
    DEFAULT_MAIN_APP_ENTRY_PATH,
  );
}

export function getMainAppSsoExchangePath() {
  return normalizePath(
    process.env.MAIN_APP_BUYER_SHOW_SSO_EXCHANGE_PATH || process.env.MAIN_APP_SSO_EXCHANGE_PATH,
    DEFAULT_MAIN_APP_SSO_EXCHANGE_PATH,
  );
}

export function getMainAppSessionPath() {
  return normalizePath(
    process.env.MAIN_APP_BUYER_SHOW_SESSION_PATH || process.env.MAIN_APP_SSO_SESSION_PATH,
    DEFAULT_MAIN_APP_SESSION_PATH,
  );
}

export function getSessionCookieName() {
  return process.env.BUYER_SHOW_SESSION_COOKIE_NAME?.trim() || DEFAULT_SESSION_COOKIE_NAME;
}

export function buildMainAppEntryUrl(baseUrl?: string) {
  const resolvedBaseUrl = stripTrailingSlash(baseUrl || getConfiguredMainAppUrl());
  if (!resolvedBaseUrl) {
    throw new Error('MAIN_APP_URL 未配置，无法构建主站回跳地址。');
  }

  return `${resolvedBaseUrl}${getMainAppEntryPath()}`;
}

export function resolveRequestedMainAppUrl(request: Pick<Request, 'url'>) {
  const url = new URL(request.url);
  return sanitizeMainAppUrl(url.searchParams.get('mainApp')) || getConfiguredMainAppUrl();
}

export async function readAppSession(request: Pick<Request, 'headers'>) {
  const cookies = parseCookieHeader(request.headers.get('cookie') || '');
  const rawValue = cookies[getSessionCookieName()];
  if (!rawValue) return null;

  const [payload, signature] = rawValue.split('.', 2);
  if (!payload || !signature) return null;

  const expectedSignature = await signSessionPayload(payload);
  if (!signaturesMatch(expectedSignature, signature)) {
    return null;
  }

  try {
    const parsed = JSON.parse(decoder.decode(base64UrlToBytes(payload))) as BuyerShowSession;
    if (!parsed?.user || !parsed.token || typeof parsed.expiresAt !== 'number') {
      return null;
    }
    if (parsed.expiresAt <= Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function validateMainAppSession(session: Pick<BuyerShowSession, 'token' | 'mainAppUrl'> | null) {
  if (!session?.token) return false;

  const sessionMainAppUrl = sanitizeMainAppUrl(session.mainAppUrl) || getConfiguredMainAppUrl();
  if (!sessionMainAppUrl) return false;

  try {
    const response = await fetch(`${stripTrailingSlash(sessionMainAppUrl)}${getMainAppSessionPath()}`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
      cache: 'no-store',
    });

    return response.ok;
  } catch (error) {
    console.error('[buyer-show-sso] Main-site session validation failed:', error);
    return false;
  }
}

export async function readFreshAppSession(request: Pick<Request, 'headers'>) {
  const session = await readAppSession(request);
  if (!session) {
    return { session: null, hadSession: false };
  }

  const isFresh = await validateMainAppSession(session);
  return {
    session: isFresh ? session : null,
    hadSession: true,
  };
}

export async function buildSessionCookie(
  session: Pick<BuyerShowSession, 'token' | 'user' | 'mainAppUrl'>,
): Promise<BuyerShowSessionCookie> {
  const expiresAt = Date.now() + getSessionTtlMs();
  const payload = bytesToBase64Url(
    encoder.encode(JSON.stringify({
      token: session.token,
      user: session.user,
      mainAppUrl: session.mainAppUrl,
      expiresAt,
    })),
  );
  const signature = await signSessionPayload(payload);

  return {
    name: getSessionCookieName(),
    value: `${payload}.${signature}`,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProductionRuntime(),
    path: '/',
    maxAge: Math.floor(getSessionTtlMs() / 1000),
    expires: new Date(expiresAt),
  };
}

export function buildClearedSessionCookie(): BuyerShowSessionCookie {
  return {
    name: getSessionCookieName(),
    value: '',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isProductionRuntime(),
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  };
}

export function serializeSessionCookie(cookie: BuyerShowSessionCookie) {
  const parts = [
    `${cookie.name}=${encodeURIComponent(cookie.value)}`,
    `Path=${cookie.path}`,
    `Max-Age=${cookie.maxAge}`,
    `Expires=${cookie.expires.toUTCString()}`,
    'SameSite=Lax',
  ];

  if (cookie.httpOnly) {
    parts.push('HttpOnly');
  }
  if (cookie.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

export function isHtmlDocumentRequest(request: Pick<Request, 'method' | 'headers'>, pathname: string) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return false;
  }

  if (pathname.startsWith('/api/')) {
    return false;
  }

  const accept = request.headers.get('accept') || '';
  return !accept || accept.includes('text/html') || accept.includes('*/*');
}

export async function exchangeMainAppSsoTicket(ticket: string, baseUrl?: string): Promise<BuyerShowSessionExchangeResult> {
  const resolvedBaseUrl = stripTrailingSlash(baseUrl || getConfiguredMainAppUrl());
  if (!resolvedBaseUrl) {
    throw new Error('MAIN_APP_URL 未配置，无法交换 SSO ticket。');
  }

  const response = await fetch(`${resolvedBaseUrl}${getMainAppSsoExchangePath()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ticket }),
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'string'
      ? payload
      : typeof payload?.message === 'string'
        ? payload.message
        : typeof payload?.error === 'string'
          ? payload.error
          : 'SSO ticket 交换失败。';
    throw new Error(message);
  }

  const data = typeof payload === 'object' && payload && 'data' in payload ? payload.data : payload;
  const token = typeof data?.token === 'string' ? data.token.trim() : '';
  const user = typeof data?.user === 'object' && data.user ? (data.user as BuyerShowSessionUser) : null;

  if (!token || !user) {
    throw new Error('主站返回的 SSO 数据缺少 token 或 user。');
  }

  return {
    token,
    user,
    redirectPath: normalizeRedirectPath(data?.redirectPath),
  };
}
