import Link from "next/link";
import { prisma } from "@/lib/db";

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
const BAND_SUB: Record<string, string> = {
  primed: "Good day to push",
  moderate: "Train as planned",
  low: "Prioritize recovery",
};

/// Feed Recovery card — reads the last-known recovery snapshot from the DB
/// (instant; refreshed in the background by the HR card's refreshRecovery).
/// Renders nothing until there's a score, so it stays out of the way for users
/// who don't wear their tracker overnight.
export default async function RecoveryCard({ userId }: { userId: string }) {
  const account = await prisma.healthAccount.findUnique({
    where: { userId },
    select: {
      recoveryScore: true,
      recoveryBand: true,
      hrvMs: true,
      restingHr: true,
      restingDelta: true,
      sleepSummary: true,
    },
  });
  if (!account || account.recoveryScore === null || !account.recoveryBand) {
    return null;
  }

  const score = account.recoveryScore;
  const band = account.recoveryBand;
  const color = BAND_COLOR[band] ?? "var(--accent)";

  // SVG ring geometry.
  const r = 26;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * c;

  const sleep = account.sleepSummary as { asleepMin?: number } | null;
  const drivers: string[] = [];
  if (sleep?.asleepMin != null)
    drivers.push(`${Math.floor(sleep.asleepMin / 60)}h ${sleep.asleepMin % 60}m sleep`);
  if (account.hrvMs != null) drivers.push(`HRV ${Math.round(account.hrvMs)}ms`);
  if (account.restingHr != null) {
    const d = account.restingDelta;
    const arrow = d == null || d === 0 ? "" : d < 0 ? " ↓" : " ↑";
    const mag = d == null || d === 0 ? "" : ` ${Math.abs(d)}`;
    drivers.push(`RHR ${account.restingHr}${arrow}${mag}`);
  }

  return (
    <Link
      href="/recovery"
      className="block rounded-2xl p-4 mb-3 transition-colors"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[14px] font-bold tracking-tight">Recovery</h3>
        <span style={{ color: "var(--fg-dim)" }}>→</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: 64, height: 64 }}>
          <svg width="64" height="64" viewBox="0 0 64 64">
            <circle
              cx="32"
              cy="32"
              r={r}
              fill="none"
              stroke="var(--bg-elevated)"
              strokeWidth="6"
            />
            <circle
              cx="32"
              cy="32"
              r={r}
              fill="none"
              stroke={color}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${filled} ${c - filled}`}
              transform="rotate(-90 32 32)"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[20px] font-bold tabular-nums">{score}</span>
          </div>
        </div>

        <div className="min-w-0">
          <p className="text-[15px] font-semibold" style={{ color }}>
            {BAND_LABEL[band] ?? "Recovery"}
          </p>
          <p className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
            {BAND_SUB[band] ?? ""}
          </p>
          {drivers.length > 0 && (
            <p
              className="text-[11px] mt-1.5 tabular-nums"
              style={{ color: "var(--fg-dim)" }}
            >
              {drivers.join(" · ")}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
