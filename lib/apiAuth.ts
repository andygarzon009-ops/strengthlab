import "server-only";
import { decrypt, getSession } from "@/lib/session";

/**
 * Resolve the authenticated user for an API route, accepting either:
 *   1. `Authorization: Bearer <jwt>` — used by the StrengthLab Android app,
 *      which stores the JWT returned from /api/auth/token, or
 *   2. the normal session cookie — used by the web app.
 *
 * Returns the userId, or null when neither is valid. The bearer JWT is the
 * exact same token the web session uses (signed with SESSION_SECRET), so no
 * separate token store is needed.
 */
export async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const payload = await decrypt(auth.slice(7).trim());
    if (payload?.userId) return payload.userId as string;
  }

  const session = await getSession();
  return session?.userId ?? null;
}
