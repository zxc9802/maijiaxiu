import {
  buildMainAppEntryUrl,
  isMainAppSsoRequired,
  readAppSession,
  resolveRequestedMainAppUrl,
  type BuyerShowSessionUser,
} from './app-session';

export type BuyerShowUser = {
  userId: string;
  account?: string;
  nickname?: string;
  groupName?: string;
  role?: string;
};

export class BuyerShowAuthError extends Error {
  status: number;
  redirectUrl: string;

  constructor(redirectUrl: string) {
    super('请先从主站登录后再进入买家秀智能体。');
    this.name = 'BuyerShowAuthError';
    this.status = 401;
    this.redirectUrl = redirectUrl;
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

  const session = await readAppSession(request);
  const user = session ? normalizeSessionUser(session.user) : null;
  if (user) {
    return user;
  }

  throw new BuyerShowAuthError(buildMainAppEntryUrl(resolveRequestedMainAppUrl(request)));
}

export function buyerShowErrorResponse(error: unknown) {
  if (error instanceof BuyerShowAuthError) {
    return Response.json(
      { ok: false, error: error.message, redirectUrl: error.redirectUrl },
      { status: error.status },
    );
  }

  return Response.json(
    { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
    { status: 400 },
  );
}
