import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getCachedSessions } from "@/lib/fitbitDetect";

/// The watch's recorded sessions from the last ~36 hours, newest first, for a
/// cardio card's "Fill from watch". Always refreshes from Google Health so a
/// hike that just ended is there.
export async function GET() {
  const userId = await requireAuth();
  const account = await prisma.healthAccount.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!account) return Response.json({ connected: false, sessions: [] });
  try {
    const { sessions } = await getCachedSessions(userId, { forceRefresh: true, days: 2 });
    const cutoff = Date.now() - 36 * 3600 * 1000;
    return Response.json({
      connected: true,
      sessions: sessions
        .filter((s) => Date.parse(s.endTime) >= cutoff)
        .slice(0, 8)
        .map((s) => ({
          id: s.externalId,
          name: s.displayName,
          startTime: s.startTime,
          endTime: s.endTime,
          durationSec: s.durationSec,
          distanceKm: s.distanceMm ? Math.round(s.distanceMm / 10_000) / 100 : null,
          calories: s.calories ?? null,
          avgHr: s.avgHR ?? null,
        })),
    });
  } catch {
    return Response.json({ connected: true, error: "Couldn't reach your watch data — try again.", sessions: [] }, { status: 502 });
  }
}
