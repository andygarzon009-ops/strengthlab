import { requireAuth } from "@/lib/session";
import { checkHealthAuth } from "@/lib/googleHealth";

export const maxDuration = 15;

/// Reports the health connection's auth state for the reconnect banner.
/// `{ connected, needsReconnect }` — needsReconnect is true when Google has
/// expired/revoked the refresh token and the user must re-run OAuth consent.
export async function GET() {
  const userId = await requireAuth();
  return Response.json(await checkHealthAuth(userId));
}
