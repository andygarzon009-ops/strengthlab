// The favourite lift on a crew profile: the athlete's chosen movement with
// its best numbers and where it's heading. Plain markup — renders on the
// server; the owner's Change pill is the only client piece.

import Sparkline from "@/components/Sparkline";
import Flame from "@/components/FlameIcon";
import FavoriteLiftPicker, { type PickableLift } from "@/components/FavoriteLiftPicker";

export type FavoriteLiftStats = {
  name: string;
  /// Loaded lifts rank by estimated max; bodyweight ones by best reps.
  mode: "load" | "reps";
  best: number; // e1RM lb, or reps
  bestSet: string | null; // "275 lb × 5"
  sessions: number;
  lastDaysAgo: number | null;
  trend: number[]; // per-session bests, oldest → newest
  gain: number | null; // best − first logged, same unit
  since: string | null; // "Mar 2026"
};

const LIME = "#a3e635";

function ago(days: number | null): string {
  if (days == null) return "—";
  if (days <= 0) return "Today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-2xl py-2 px-2 text-center min-w-0"
      style={{ background: "rgba(0,0,0,0.28)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-muted)" }}>
        {label}
      </p>
      <p className="text-[14px] font-bold tabular-nums mt-0.5 truncate">{value}</p>
    </div>
  );
}

export default function FavoriteLiftCard({
  stats,
  isSelf,
  pickable,
}: {
  stats: FavoriteLiftStats;
  isSelf: boolean;
  pickable: PickableLift[];
}) {
  const unit = stats.mode === "load" ? "lb" : "reps";
  return (
    <section
      className="relative rounded-3xl p-5 mt-3 overflow-hidden"
      style={{
        background:
          "radial-gradient(90% 80% at 100% 0%, rgba(163,230,53,0.22) 0%, transparent 60%), radial-gradient(80% 90% at 0% 100%, rgba(34,197,94,0.16) 0%, transparent 60%), var(--bg-card)",
        border: "1px solid rgba(163,230,53,0.35)",
        boxShadow: "0 0 40px rgba(163,230,53,0.08)",
      }}
    >
      {/* Watermark flame */}
      <div className="absolute pointer-events-none" style={{ right: -18, bottom: -22, opacity: 0.08 }} aria-hidden>
        <Flame size={170} />
      </div>

      <div className="relative flex items-center justify-between gap-3">
        <p
          className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em]"
          style={{ color: LIME }}
        >
          <Flame size={14} />
          Favourite lift
        </p>
        {isSelf && <FavoriteLiftPicker lifts={pickable} current={stats.name} variant="edit" />}
      </div>

      <h3 className="relative text-[24px] font-extrabold tracking-tight leading-tight mt-2 truncate">
        {stats.name}
      </h3>

      <div className="relative flex items-end justify-between gap-3 mt-3">
        <div>
          <p className="leading-none">
            <span
              className="text-[46px] font-extrabold tabular-nums"
              style={{
                letterSpacing: "-0.04em",
                background: "linear-gradient(180deg, #ecfccb 0%, #a3e635 55%, #22c55e 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                filter: "drop-shadow(0 0 14px rgba(163,230,53,0.35))",
              }}
            >
              {stats.best > 0 ? Math.round(stats.best) : "—"}
            </span>
            <span className="text-[14px] font-semibold ml-1.5" style={{ color: "var(--fg-muted)" }}>
              {stats.mode === "load" ? "lb est. max" : "best reps"}
            </span>
          </p>
          {stats.gain != null && stats.gain > 0 && stats.since && (
            <p className="text-[12px] font-semibold mt-2 tabular-nums" style={{ color: "#4ade80" }}>
              ▲ {Math.round(stats.gain)} {unit} since {stats.since}
            </p>
          )}
        </div>
        {stats.trend.length >= 2 && (
          <div style={{ filter: "drop-shadow(0 0 6px rgba(163,230,53,0.55))" }}>
            <Sparkline
              values={stats.trend}
              width={124}
              height={48}
              color={LIME}
              strokeWidth={2.5}
              dot
              label={`${stats.name} trend`}
            />
          </div>
        )}
      </div>

      <div className="relative grid grid-cols-3 gap-2 mt-4">
        <Chip label="Best set" value={stats.bestSet ?? "—"} />
        <Chip label="Sessions" value={String(stats.sessions)} />
        <Chip label="Last" value={ago(stats.lastDaysAgo)} />
      </div>
    </section>
  );
}
