import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  buildClearedSessionCookie,
  buildMainAppEntryUrl,
  buildSessionCookie,
  exchangeMainAppSsoTicket,
  isHtmlDocumentRequest,
  isMainAppSsoRequired,
  readAppSession,
  resolveRequestedMainAppUrl,
} from '@/lib/buyer-show/app-session';

export async function middleware(request: NextRequest) {
  if (!isMainAppSsoRequired()) {
    return NextResponse.next();
  }

  const { pathname, searchParams } = request.nextUrl;
  const requestedMainAppUrl = resolveRequestedMainAppUrl(request);
  const ticket = searchParams.get('ticket')?.trim();

  if (ticket && !pathname.startsWith('/api/')) {
    try {
      const exchangeResult = await exchangeMainAppSsoTicket(ticket, requestedMainAppUrl);
      const redirectUrl = new URL(exchangeResult.redirectPath, request.url);
      redirectUrl.searchParams.delete('ticket');
      redirectUrl.searchParams.delete('mainApp');

      const response = NextResponse.redirect(redirectUrl, 302);
      response.cookies.set(
        await buildSessionCookie({
          token: exchangeResult.token,
          user: exchangeResult.user,
          mainAppUrl: requestedMainAppUrl,
        }),
      );
      return response;
    } catch (error) {
      console.error('[buyer-show-sso] Ticket exchange failed:', error);

      const mainEntryUrl = new URL(buildMainAppEntryUrl(requestedMainAppUrl));
      mainEntryUrl.searchParams.set('ssoError', 'ticket_exchange_failed');
      const response = NextResponse.redirect(mainEntryUrl, 302);
      response.cookies.set(buildClearedSessionCookie());
      return response;
    }
  }

  if (!isHtmlDocumentRequest(request, pathname)) {
    return NextResponse.next();
  }

  const session = await readAppSession(request);
  if (session) {
    return NextResponse.next();
  }

  return NextResponse.redirect(buildMainAppEntryUrl(requestedMainAppUrl), 302);
}

export const config = {
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.[^/]+$).*)',
  ],
};
