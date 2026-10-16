import { unstable_cache } from "next/cache";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  HealthReauthRequiredError,
  listVitalDaily,
  listVitalSamples,
} from "@/lib/googleHealth";
import { isVitalKey, VITALS } from "@/lib/vitals";

export const maxDuration = 60;

/// The month view moves every morning; the year barely moves day to day and
/// costs a dozen-plus paged Google Health calls, so it's held much longer.
const getMonth = unstable_cache(
  (userId: string, metric: Parameters<typeof listVitalDaily>[1]) =>
    listVitalDaily(userId, metric, 31),
  ["vital-month-v1"],
  { revalidate: 30 * 60 },
);
const getYear = unstable_cache(
  (userId: string, metric: Parameters<typeof listVitalDaily>[1]) =>
    listVitalDaily(userId, metric, 366),
  ["vital-year-v1"],
  { revalidate: 6 * 60 * 60 },
);

/// GET ?range=month|year → { days: VitalPoint[] }
/// GET ?start=ISO&end=ISO → { samples: VitalSample[] } (HRV / blood oxygen)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ metric: string }> },
) {
  const userId = await requireAuth();
  const { metric } = await params;
  if (!isVitalKey(metric)) return Response.json({ error: "unknown" }, { status: 404 });

  const account = await prisma.healthAccount.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!account) return Response.json({ days: [], samples: [] });

  const url = new URL(req.url);
  try {
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    if (start && end) {
      const s = Date.parse(start);
      const e = Date.parse(end);
      if (!VITALS[metric].night || !Number.isFinite(s) || !Number.isFinite(e) || e <= s || e - s > 20 * 3_600_000)
        return Response.json({ error: "bad range" }, { status: 400 });
      const samples = await listVitalSamples(
        userId,
        metric as "hrv" | "spo2",
        new Date(s).toISOString(),
        new Date(e).toISOString(),
      );
      return Response.json({ samples });
    }
    const days =
      url.searchParams.get("range") === "year"
        ? await getYear(userId, metric)
        : await getMonth(userId, metric);
    return Response.json({ days });
  } catch (e) {
    console.error(`[vitals:${metric}]`, e);
    return Response.json(
      { days: [], samples: [], needsReconnect: e instanceof HealthReauthRequiredError },
      { status: 502 },
    );
  }
}
