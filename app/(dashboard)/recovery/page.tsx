import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import BackButton from "@/components/BackButton";

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
    },
  });

  const score = account?.recoveryScore ?? null;
  const band = account?.recoveryBand ?? null;
  const color = band ? (BAND_COLOR[band] ?? "var(--accent)") : "var(--fg-dim)";

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <BackButton href="/" ariaLabel="Back to feed" />
        <h1 className="text-[22px] font-bold tracking-tight">Recovery</h1>
      </div>

      {score === null || !band ? (
        <EmptyState connected={!!account} />
      ) : (
        <>
          {/* Hero score */}
          <div
            className="rounded-2xl p-6 mb-4 flex flex-col items-center text-center"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
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

          {/* What's driving it */}
          <p className="label mb-2">What&apos;s driving it</p>
          <div className="space-y-2 mb-5">
            <DriverRow
              label="HRV (last night)"
              value={account?.hrvMs != null ? `${Math.round(account.hrvMs)} ms` : "—"}
              baseline={
                account?.hrvBaselineMs != null
                  ? `${Math.round(account.hrvBaselineMs)} ms`
                  : null
              }
              good={
                account?.hrvMs != null && account?.hrvBaselineMs != null
                  ? account.hrvMs >= account.hrvBaselineMs
                  : null
              }
              higherIsBetter
            />
            <DriverRow
              label="Resting HR"
              value={account?.restingHr != null ? `${account.restingHr} bpm` : "—"}
              baseline={
                account?.restingBaselineHr != null
                  ? `${account.restingBaselineHr} bpm`
                  : null
              }
              good={
                account?.restingHr != null && account?.restingBaselineHr != null
                  ? account.restingHr <= account.restingBaselineHr
                  : null
              }
              higherIsBetter={false}
            />
          </div>

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
            Recovery blends your overnight HRV and resting heart rate against
            your own baseline. Wear your tracker to bed for the most accurate
            score. Sleep stages are coming soon.
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
        <circle cx="66" cy="66" r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth="10" />
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

function DriverRow({
  label,
  value,
  baseline,
  good,
  higherIsBetter,
}: {
  label: string;
  value: string;
  baseline: string | null;
  good: boolean | null;
  higherIsBetter: boolean;
}) {
  const tint =
    good === null ? "var(--fg-dim)" : good ? "var(--accent)" : "#f97316";
  const note =
    good === null
      ? baseline
        ? `baseline ${baseline}`
        : "building baseline"
      : `${good ? "better" : "worse"} than your ${baseline} baseline`;
  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center justify-between"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{label}</p>
        <p className="text-[11px] mt-0.5" style={{ color: tint }}>
          {note}
          {good !== null && (
            <span aria-hidden>
              {" "}
              {/* arrow shows the value's direction vs baseline: for HRV,
                  good=higher=↑; for RHR, good=lower=↓ */}
              {(higherIsBetter ? good : !good) ? "↑" : "↓"}
            </span>
          )}
        </p>
      </div>
      <span className="text-[16px] font-bold tabular-nums">{value}</span>
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
