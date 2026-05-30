import { after } from "next/server";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getCachedSessions } from "@/lib/fitbitDetect";
import { refreshRestingHr } from "@/lib/restingHr";

/// Returns the user's recent Fitbit exercise sessions from Supabase cache.
/// `?refresh=1` forces a pull from Google Health; otherwise the cache is
/// reused if it's fresh (<1h old) and refreshed transparently when stale.
export async function GET(req: Request) {
  const userId = await requireAuth();
  const account = await prisma.healthAccount.findUnique({ where: { userId } });
  if (!account) {
    return Response.json({ connected: false }, { status: 200 });
  }

  const url = new URL(req.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  try {
    const { sessions, lastSyncedAt, refreshed } = await getCachedSessions(userId, {
      forceRefresh,
    });
    // When we actually pulled fresh data from Google, also refresh the stored
    // resting HR (post-response, so it doesn't slow the sync down).
    if (refreshed) after(() => refreshRestingHr(userId));
    return Response.json({
      connected: true,
      exercise: sessions.map((s) => ({
        name: s.externalId,
        exercise: {
          interval: { startTime: s.startTime, endTime: s.endTime },
          displayName: s.displayName,
          exerciseType: s.exerciseType,
          activeDuration: `${s.durationSec}s`,
          metricsSummary: {
            caloriesKcal: s.calories,
            steps: s.steps != null ? String(s.steps) : undefined,
            averageHeartRateBeatsPerMinute:
              s.avgHR != null ? String(s.avgHR) : undefined,
          },
        },
      })),
      lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
      refreshed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ connected: true, error: msg }, { status: 502 });
  }
}
