import {
  buildClearedSessionCookie,
  buildMainAppEntryUrl,
  isMainAppSsoRequired,
  readFreshAppSession,
  resolveRequestedMainAppUrl,
  serializeSessionCookie,
  type BuyerShowSessionUser,
} from './app-session';

export type BuyerShowUser = {
  userId: string;
  account?: string;
  nickname?: string;
  groupName?: string;
  role?: string;
};

type BuyerShowAuthErrorCode = 'SESSION_REQUIRED' | 'SESSION_REVOKED';

export class BuyerShowAuthError extends Error {
  status: number;
  redirectUrl: string;
  code: BuyerShowAuthErrorCode;

  constructor(redirectUrl: string, code: BuyerShowAuthErrorCode = 'SESSION_REQUIRED') {
    super(code === 'SESSION_REVOKED'
      ? '主站登录状态已失效，请重新从主站进入买家秀智能体。'
      : '请先从主站登录后再进入买家秀智能体。');
    this.name = 'BuyerShowAuthError';
    this.status = 401;
    this.redirectUrl = redirectUrl;
    this.code = code;
  }
}

function readStringField(user: BuyerShowSessionUser, key: string) {
  const value = user[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeSessionUser(user: BuyerShowSessionUser): BuyerShowUser | null {
  const userId = readStringField(user, 'id') || readStringField(user, 'userId');
  if (!userId) return null;

  return {
    userId,
    account: readStringField(user, 'account') || readStringField(user, 'email'),
    nickname: readStringField(user, 'nickname'),
    groupName: readStringField(user, 'groupName'),
    role: readStringField(user, 'role'),
  };
}

export async function readCurrentBuyerShowUser(request: Request): Promise<BuyerShowUser> {
  if (!isMainAppSsoRequired()) {
    return {
      userId: 'buyer-show-local-dev-user',
      account: 'local-dev',
      nickname: '本地开发用户',
      role: 'admin',
    };
  }

  const { session, hadSession } = await readFreshAppSession(request);
  const user = session ? normalizeSessionUser(session.user) : null;
  if (user) {
    return user;
  }

  throw new BuyerShowAuthError(
    buildMainAppEntryUrl(resolveRequestedMainAppUrl(request)),
    hadSession ? 'SESSION_REVOKED' : 'SESSION_REQUIRED',
  );
}

export function buyerShowErrorResponse(error: unknown) {
  if (error instanceof BuyerShowAuthError) {
    const response = Response.json(
      { ok: false, code: error.code, error: error.message, redirectUrl: error.redirectUrl },
      { status: error.status },
    );
    response.headers.append('Set-Cookie', serializeSessionCookie(buildClearedSessionCookie()));
    return response;
  }

  return Response.json(
    { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
    { status: 400 },
  );
}
