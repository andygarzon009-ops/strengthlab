import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import BackButton from "@/components/BackButton";
import { type SleepSummary } from "@/components/SleepDetail";
import { type SleepNightHistory } from "@/components/SleepHistoryChart";
import HealthReconnectBanner from "@/components/HealthReconnectBanner";
import ReadinessView from "@/components/ReadinessView";
import {
  readinessBand,
  type ReadinessBand,
  type ReadinessFactor,
} from "@/lib/readiness";

export const dynamic = "force-dynamic";

function ago(d: Date): string {
  const m = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (m < 2) return "Updated just now";
  if (m < 60) return `Updated ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Updated ${h}h ago`;
  const day = Math.floor(h / 24);
  return day === 1 ? "Updated yesterday" : `Updated ${day}d ago`;
}

export default async function RecoveryPage() {
  const userId = await requireAuth();
  const [account, user, days] = await Promise.all([
    prisma.healthAccount.findUnique({
      where: { userId },
      select: {
        recoveryScore: true,
        recoveryBand: true,
        recoveryAt: true,
        hrvMs: true,
        hrvBaselineMs: true,
        restingHr: true,
        restingBaselineHr: true,
        sleepSummary: true,
        sleepNightKey: true,
        sleepHistory: true,
        readinessFactors: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    }),
    prisma.recoveryDay.findMany({
      where: { userId },
      orderBy: { dateKey: "desc" },
      take: 7,
      select: {
        dateKey: true,
        score: true,
        band: true,
        hrvMs: true,
        restingHr: true,
      },
    }),
  ]);

  const score = account?.recoveryScore ?? null;
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: user?.timezone ?? "UTC",
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());

  return (
    <div className="max-w-lg mx-auto px-4 pt-8">
      <div className="flex items-center gap-3 mb-5">
        <BackButton href="/" ariaLabel="Back to feed" />
        <h1 className="text-[22px] font-bold tracking-tight">Readiness</h1>
      </div>

      <HealthReconnectBanner />

      {score === null ? (
        <EmptyState connected={!!account} />
      ) : (
        <ReadinessView
          score={score}
          band={
            (account?.recoveryBand as ReadinessBand | null) ??
            readinessBand(score)
          }
          dateLabel={dateLabel}
          updatedLabel={account?.recoveryAt ? ago(account.recoveryAt) : null}
          factors={(account?.readinessFactors as ReadinessFactor[] | null) ?? []}
          days={days.reverse()}
          lastNight={(account?.sleepSummary as SleepSummary | null) ?? null}
          lastNightKey={account?.sleepNightKey ?? null}
          sleepHistory={
            (account?.sleepHistory as SleepNightHistory[] | null) ?? []
          }
          hrv={{ now: account?.hrvMs ?? null, baseline: account?.hrvBaselineMs ?? null }}
          rhr={{
            now: account?.restingHr ?? null,
            baseline: account?.restingBaselineHr ?? null,
          }}
        />
      )}
    </div>
  );
}

function EmptyState({ connected }: { connected: boolean }) {
  return (
    <div
      className="rounded-2xl px-6 py-12 text-center"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="text-[32px] mb-3">😴</div>
      <p className="text-[15px] font-semibold">No readiness score yet</p>
      <p
        className="text-[13px] mt-1.5 leading-snug max-w-[20rem] mx-auto"
        style={{ color: "var(--fg-dim)" }}
      >
        {connected
          ? "Wear your tracker to bed — readiness is built from your overnight HRV and resting heart rate. It'll appear here after your next night's sync."
          : "Connect Fitbit via Health & Fitbit in your profile, and wear your tracker overnight to get a readiness score."}
      </p>
      {!connected && (
        <Link
          href="/health"
          className="inline-block mt-5 px-5 py-2.5 rounded-xl text-[13px] font-semibold"
          style={{ background: "var(--accent)", color: "#0a0a0a" }}
        >
          Connect Fitbit
        </Link>
      )}
    </div>
  );
}

