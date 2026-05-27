import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listHeartRateBetween } from "@/lib/googleHealth";

/// Returns the most recent heart-rate sample from the last 5 minutes, fetched
/// live from Google Health. Used by the logger's live HR widget — accuracy is
/// best-effort: Fitbit sync delay typically lags 15–90 seconds behind real time.
export async function GET() {
  const userId = await requireAuth();
  const account = await prisma.healthAccount.findUnique({ where: { userId } });
  if (!account) return Response.json({ connected: false });

  const end = new Date();
  const start = new Date(end.getTime() - 5 * 60 * 1000);

  try {
    const samples = await listHeartRateBetween(
      userId,
      start.toISOString(),
      end.toISOString(),
    );
    if (samples.length === 0) {
      return Response.json({ connected: true, bpm: null, at: null });
    }
    const latest = samples[samples.length - 1];
    return Response.json({
      connected: true,
      bpm: latest.bpm,
      at: latest.timestamp.toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ connected: true, error: msg }, { status: 502 });
  }
}
