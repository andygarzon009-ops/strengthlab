import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listHeartRateBetween } from "@/lib/googleHealth";

export const maxDuration = 30;

/// Heart-rate samples for the last 60 minutes, used by the H view on
/// /heart-rate. Faster cadence than the day endpoint so the chart can
/// fill in near-live as the user trains.
export async function GET() {
  const userId = await requireAuth();
  const account = await prisma.healthAccount.findUnique({ where: { userId } });
  if (!account) return Response.json({ connected: false });

  const end = new Date();
  const start = new Date(end.getTime() - 60 * 60 * 1000);

  try {
    const samples = await listHeartRateBetween(
      userId,
      start.toISOString(),
      end.toISOString(),
    );
    return Response.json({
      connected: true,
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      samples: samples.map((s) => ({
        t: s.timestamp.toISOString(),
        bpm: s.bpm,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 502 });
  }
}
