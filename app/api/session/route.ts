import { buyerShowErrorResponse, readCurrentBuyerShowUser } from '@/lib/buyer-show/auth';
import { isMainAppSsoRequired } from '@/lib/buyer-show/app-session';

export async function GET(request: Request) {
  try {
    const user = await readCurrentBuyerShowUser(request);
    return Response.json({
      ok: true,
      requiresSso: isMainAppSsoRequired(),
      user,
    });
  } catch (error) {
    return buyerShowErrorResponse(error);
  }
}
