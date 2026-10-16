import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import BackButton from "@/components/BackButton";
import HealthReconnectBanner from "@/components/HealthReconnectBanner";
import VitalDetail, { type VitalNight } from "@/components/VitalDetail";
import { type SleepSummary } from "@/components/SleepDetail";
import { type SleepNightHistory } from "@/components/SleepHistoryChart";
import { isVitalKey, VITALS } from "@/lib/vitals";

export const dynamic = "force-dynamic";

/// One overnight vital (HRV, resting HR, blood oxygen, breathing, skin temp),
/// opened from its tile on the readiness page.
export default async function VitalPage({
  params,
}: {
  params: Promise<{ metric: string }>;
}) {
  const { metric } = await params;
  if (!isVitalKey(metric)) notFound();
  const userId = await requireAuth();

  // The night view needs each night's bed→wake window; those live on the
  // stored sleep snapshot, so only load them for the vitals that have one.
  let nights: VitalNight[] = [];
  if (VITALS[metric].night) {
    const account = await prisma.healthAccount.findUnique({
      where: { userId },
      select: { sleepSummary: true, sleepNightKey: true, sleepHistory: true },
    });
    const byDate = new Map<string, VitalNight>();
    const add = (date: string | null | undefined, s: Partial<SleepNightHistory> | null) => {
      if (!date || !s?.startUtc || !s.endUtc || s.offsetSec == null || byDate.has(date)) return;
      byDate.set(date, { date, startUtc: s.startUtc, endUtc: s.endUtc, offsetSec: s.offsetSec });
    };
    add(account?.sleepNightKey, (account?.sleepSummary as SleepSummary | null) ?? null);
    for (const h of (account?.sleepHistory as SleepNightHistory[] | null) ?? []) add(h.date, h);
    nights = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-8">
      <div className="flex items-center gap-3 mb-5">
        <BackButton href="/recovery" ariaLabel="Back to readiness" />
        <h1 className="text-[22px] font-bold tracking-tight">{VITALS[metric].title}</h1>
      </div>
      <HealthReconnectBanner />
      <VitalDetail metric={metric} nights={nights} />
    </div>
  );
}
