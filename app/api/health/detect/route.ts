import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listUnmatchedFitbitSessions } from "@/lib/fitbitDetect";

export async function GET(req: Request) {
  const userId = await requireAuth();
  const account = await prisma.healthAccount.findUnique({ where: { userId } });
  if (!account) {
    return Response.json({ connected: false, sessions: [] });
  }
  const url = new URL(req.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  try {
    const { sessions, lastSyncedAt } = await listUnmatchedFitbitSessions(userId, {
      forceRefresh,
    });
    return Response.json({
      connected: true,
      sessions,
      lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json(
      { connected: true, error: msg, sessions: [] },
      { status: 502 }
    );
  }
}
