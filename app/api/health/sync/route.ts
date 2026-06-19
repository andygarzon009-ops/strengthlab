import { after } from "next/server";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getCachedSessions } from "@/lib/fitbitDetect";
import { refreshRecovery, maybeRefreshRecovery } from "@/lib/recovery";

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
    // Refresh the stored recovery/sleep snapshot post-response (never blocks
    // the sync). An explicit refresh pulls unconditionally; otherwise we go on
    // the snapshot's OWN staleness — decoupled from the exercise-session cache,
    // so opening this page reliably picks up last night's sleep even when the
    // session cache is still warm.
    if (forceRefresh) after(() => refreshRecovery(userId));
    else after(() => maybeRefreshRecovery(userId));
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
