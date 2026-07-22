import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { sleepQualityScore } from "@/lib/recovery";
import BackButton from "@/components/BackButton";
import SleepDetail, { type SleepSummary } from "@/components/SleepDetail";
import SleepHistoryChart, {
  type SleepNightHistory,
} from "@/components/SleepHistoryChart";
import RecoveryDays from "@/components/RecoveryDays";
import Spo2Card from "@/components/Spo2Card";
import HealthReconnectBanner from "@/components/HealthReconnectBanner";

export const dynamic = "force-dynamic";

const BAND_COLOR: Record<string, string> = {
  primed: "#22c55e",
  moderate: "#f59e0b",
  low: "#ef4444",
};
const BAND_LABEL: Record<string, string> = {
  primed: "Primed",
  moderate: "Moderate",
  low: "Take it easy",
};
const BAND_REC: Record<string, string> = {
  primed: "Your body's ready — a good day to push hard or chase a PR.",
  moderate: "Recovery is middling. Train as planned, but don't force it.",
  low: "You're under-recovered. Go light, prioritize sleep, or take a rest day.",
};

function ago(d: Date): string {
  const h = Math.floor((Date.now() - d.getTime()) / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const day = Math.floor(h / 24);
  return day === 1 ? "yesterday" : `${day}d ago`;
}

export default async function RecoveryPage() {
  const userId = await requireAuth();
  const account = await prisma.healthAccount.findUnique({
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
    },
  });
  const sleepHistory =
    (account?.sleepHistory as SleepNightHistory[] | null) ?? [];

  const trendDays = (
    await prisma.recoveryDay.findMany({
      where: { userId },
      orderBy: { dateKey: "desc" },
      take: 7,
      select: { dateKey: true, score: true, band: true },
    })
  ).reverse(); // oldest → newest

  const score = account?.recoveryScore ?? null;
  const band = account?.recoveryBand ?? null;
  const color = band ? (BAND_COLOR[band] ?? "var(--accent)") : "var(--fg-dim)";
  const sleep = (account?.sleepSummary as SleepSummary | null) ?? null;
  const sleepQuality = sleep
    ? sleepQualityScore(sleep.asleepMin, sleep.deepMin, sleep.remMin)
    : null;

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <BackButton href="/" ariaLabel="Back to feed" />
        <h1 className="text-[22px] font-bold tracking-tight">Recovery</h1>
      </div>

      <HealthReconnectBanner />

      {score === null || !band ? (
        <EmptyState connected={!!account} />
      ) : (
        <>
          {/* Hero score */}
          <div
            className="relative rounded-2xl p-6 mb-4 flex flex-col items-center text-center overflow-hidden"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
            }}
          >
            {/* soft band-tinted glow behind the ring */}
            <div
              aria-hidden
              className="absolute -top-16 left-1/2 -translate-x-1/2 pointer-events-none"
              style={{
                width: 220,
                height: 220,
                background: `radial-gradient(circle, ${color}22 0%, transparent 70%)`,
              }}
            />
            <Ring score={score} color={color} />
            <p className="text-[18px] font-bold mt-3" style={{ color }}>
              {BAND_LABEL[band]}
            </p>
            <p
              className="text-[13px] mt-1 leading-snug max-w-[18rem]"
              style={{ color: "var(--fg-muted)" }}
            >
              {BAND_REC[band]}
            </p>
            {account?.recoveryAt && (
              <p className="text-[10px] mt-3" style={{ color: "var(--fg-dim)" }}>
                Updated {ago(account.recoveryAt)}
              </p>
            )}
          </div>

          {/* Trend + sleep — tap a day to read that night */}
          {trendDays.length >= 2 ? (
            <RecoveryDays
              days={trendDays}
              history={sleepHistory}
              lastNight={sleep}
              lastNightKey={account?.sleepNightKey ?? null}
            />
          ) : (
            sleep &&
            sleepQuality != null && (
              <SleepDetail sleep={sleep} qualityScore={sleepQuality} />
            )
          )}

          {/* Overnight vitals */}
          <p className="label mb-2">Overnight vitals</p>
          <div className="grid grid-cols-2 gap-2 mb-5">
            <VitalTile
              label="HRV"
              value={
                account?.hrvMs != null ? `${Math.round(account.hrvMs)}` : "—"
              }
              unit="ms"
              baseline={
                account?.hrvBaselineMs != null
                  ? Math.round(account.hrvBaselineMs)
                  : null
              }
              current={
                account?.hrvMs != null ? Math.round(account.hrvMs) : null
              }
              higherIsBetter
            />
            <VitalTile
              label="Resting HR"
              value={account?.restingHr != null ? `${account.restingHr}` : "—"}
              unit="bpm"
              baseline={account?.restingBaselineHr ?? null}
              current={account?.restingHr ?? null}
              higherIsBetter={false}
            />
          </div>

          <Spo2Card />

          {sleepHistory.length >= 2 && (
            <SleepHistoryChart history={sleepHistory} />
          )}

          {/* Coach nudge */}
          <Link
            href="/group?coach=1"
            className="flex items-center justify-center gap-2 w-full rounded-xl py-3 text-[14px] font-semibold"
            style={{ background: "var(--accent)", color: "#0a0a0a" }}
          >
            🤖 Ask your coach about today
          </Link>

          <p
            className="text-[11px] mt-4 leading-snug"
            style={{ color: "var(--fg-dim)" }}
          >
            Recovery blends last night&apos;s sleep, your overnight HRV, and
            resting heart rate against your own baseline. Wear your tracker to
            bed for the most accurate score.
          </p>
        </>
      )}
    </div>
  );
}

function Ring({ score, color }: { score: number; color: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <div className="relative" style={{ width: 132, height: 132 }}>
      <svg width="132" height="132" viewBox="0 0 132 132">
        <circle
          cx="66"
          cy="66"
          r={r}
          fill="none"
          stroke="var(--bg-elevated)"
          strokeWidth="10"
        />
        <circle
          cx="66"
          cy="66"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          transform="rotate(-90 66 66)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[34px] font-bold leading-none tabular-nums">
          {score}
        </span>
        <span className="text-[10px] mt-1" style={{ color: "var(--fg-dim)" }}>
          / 100
        </span>
      </div>
    </div>
  );
}

function VitalTile({
  label,
  value,
  unit,
  baseline,
  current,
  higherIsBetter,
}: {
  label: string;
  value: string;
  unit: string;
  baseline: number | null;
  current: number | null;
  higherIsBetter: boolean;
}) {
  const good =
    current != null && baseline != null
      ? higherIsBetter
        ? current >= baseline
        : current <= baseline
      : null;
  const tint =
    good === null ? "var(--fg-dim)" : good ? "var(--accent)" : "#f97316";
  // Arrow shows the value's direction vs baseline (up if current is higher).
  const arrow =
    current != null && baseline != null
      ? current === baseline
        ? ""
        : current > baseline
          ? "↑"
          : "↓"
      : "";
  const note =
    baseline == null
      ? "building baseline"
      : `baseline ${baseline} ${unit}`;

  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
        {label}
      </p>
      <p className="mt-1">
        <span className="text-[22px] font-bold tabular-nums" style={{ color: tint }}>
          {value}
        </span>
        <span className="text-[11px] ml-1" style={{ color: "var(--fg-dim)" }}>
          {unit}
        </span>
        {arrow && (
          <span className="text-[13px] ml-1" style={{ color: tint }} aria-hidden>
            {arrow}
          </span>
        )}
      </p>
      <p className="text-[10px] mt-1" style={{ color: "var(--fg-dim)" }}>
        {note}
      </p>
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
      <p className="text-[15px] font-semibold">No recovery score yet</p>
      <p
        className="text-[13px] mt-1.5 leading-snug max-w-[20rem] mx-auto"
        style={{ color: "var(--fg-dim)" }}
      >
        {connected
          ? "Wear your tracker to bed — recovery is built from your overnight HRV and resting heart rate. It'll appear here after your next night's sync."
          : "Connect Fitbit via Health & Fitbit in your profile, and wear your tracker overnight to get a recovery score."}
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
