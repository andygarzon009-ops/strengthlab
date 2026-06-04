import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listOxygenSaturation } from "@/lib/googleHealth";

export const maxDuration = 30;

/// Recent nightly blood-oxygen (SpO2) for the recovery page card. Pulls the
/// last 14 nights from Google Health, derives the user's own baseline from the
/// prior nights, and flags last night when it sits notably low or below that
/// baseline (an early illness / poor-recovery signal). Live read — the
/// recovery snapshot in the DB doesn't store SpO2, so there's no migration.
export async function GET() {
  const userId = await requireAuth();
  const account = await prisma.healthAccount.findUnique({ where: { userId } });
  if (!account) return Response.json({ connected: false });

  const now = new Date();
  const start = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const nights = await listOxygenSaturation(
    userId,
    start.toISOString(),
    now.toISOString(),
  ).catch(() => []);

  if (nights.length === 0) {
    return Response.json({ connected: true, lastNight: null });
  }

  const round1 = (x: number) => Math.round(x * 10) / 10;
  const last = nights[nights.length - 1];
  const prior = nights.slice(0, -1);
  const baselineAvg =
    prior.length >= 2
      ? prior.reduce((s, n) => s + n.avgPct, 0) / prior.length
      : null;

  // Flag priority: a clinically-notable low reading wins; otherwise a clear
  // dip below the user's own baseline (≥2 points) is worth surfacing.
  let flag: "low" | "belowBaseline" | null = null;
  if (last.minPct < 90 || last.avgPct < 92) flag = "low";
  else if (baselineAvg !== null && last.avgPct <= baselineAvg - 2)
    flag = "belowBaseline";

  return Response.json({
    connected: true,
    lastNight: {
      date: last.date.toISOString().slice(0, 10),
      avgPct: round1(last.avgPct),
      minPct: round1(last.minPct),
    },
    baselineAvg: baselineAvg !== null ? round1(baselineAvg) : null,
    flag,
    nights: nights.map((n) => ({
      date: n.date.toISOString().slice(0, 10),
      avgPct: round1(n.avgPct),
      minPct: round1(n.minPct),
    })),
  });
}
