"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteGoal } from "@/lib/actions/goals";
import { formatLoad } from "@/lib/exercises";
import type { LiftTrend } from "@/lib/strengthProgression";
import AddGoalForm from "@/components/AddGoalForm";

type Exercise = { id: string; name: string };

function formatLbs(n: number): string {
  return `${Math.round(n).toLocaleString()} lb`;
}

function relativeDate(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60 * 60) return "just now";
  if (sec < 60 * 60 * 24) return `${Math.floor(sec / 3600)}h ago`;
  const day = Math.floor(sec / 86400);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function TopLiftsCard({
  lifts,
  exercises,
}: {
  lifts: LiftTrend[];
  exercises: Exercise[];
}) {
  // This card now shows targets only — top lifts without a goal are dropped.
  const targets = lifts.filter((l) => l.target);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  return (
    // No outer margin: the Progress page owns the spacing between sections.
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[15px] font-bold tracking-tight">Targets</h2>
        <div className="flex items-center gap-4">
          {targets.length > 0 && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="text-[13px] font-semibold"
              style={{ color: editing ? "#f87171" : "var(--fg-muted)" }}
            >
              {editing ? "Done" : "Edit"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="text-[13px] font-semibold"
            style={{ color: adding ? "var(--fg-muted)" : "var(--accent)" }}
          >
            {adding ? "Cancel" : "+ Add"}
          </button>
        </div>
      </div>

      {adding && (
        <AddGoalForm
          exercises={exercises}
          strengthOnly
          onDone={() => setAdding(false)}
          onSaved={() => router.refresh()}
        />
      )}

      {targets.length === 0 ? (
        !adding && (
          <div
            className="rounded-2xl p-5 text-center"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-strong)",
            }}
          >
            <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
              No targets yet. Tap{" "}
              <span style={{ color: "var(--accent)" }}>+ Add</span> to set a
              strength target and track your progress here.
            </p>
          </div>
        )
      ) : (
        <div className="space-y-2">
          {targets.map((l) => (
            <TargetRow
              key={l.target?.goalId ?? l.exerciseId}
              lift={l}
              editing={editing}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TargetRow({ lift, editing }: { lift: LiftTrend; editing: boolean }) {
  const goalId = lift.target?.goalId;
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}
    >
      <Link
        href={`/strength/${encodeURIComponent(lift.exerciseId)}`}
        className="block transition-colors"
      >
        <LiftRowBody lift={lift} />
      </Link>
      {editing && goalId && <RemoveTargetButton goalId={goalId} />}
    </div>
  );
}

function RemoveTargetButton({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onRemove = () => {
    if (!confirm("Remove this target?")) return;
    startTransition(async () => {
      await deleteGoal(goalId);
      router.refresh();
    });
  };

  return (
    <div className="px-4 pb-3">
      <button
        type="button"
        onClick={onRemove}
        disabled={pending}
        className="w-full text-[11px] font-semibold py-1.5 rounded-lg transition-colors disabled:opacity-50"
        style={{
          color: "#f87171",
          background: "rgba(248,113,113,0.08)",
          border: "1px solid rgba(248,113,113,0.25)",
        }}
      >
        {pending ? "Removing…" : "Remove target"}
      </button>
    </div>
  );
}

/// Progress ring for a target: how far the current est. 1RM has come toward
/// the goal's, gold once it's reached.
function TargetRing({ pct }: { pct: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  const done = pct >= 1;
  const color = done ? "#eab308" : "#22c55e";
  return (
    <div className="relative shrink-0" style={{ width: 52, height: 52 }}>
      <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden>
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth="5" />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${(p * c).toFixed(2)} ${(c - p * c).toFixed(2)}`}
          transform="rotate(-90 26 26)"
          style={{ filter: `drop-shadow(0 0 4px ${color}66)` }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold tabular-nums">
        {done ? "✓" : `${Math.round(pct * 100)}%`}
      </span>
    </div>
  );
}

function LiftRowBody({ lift }: { lift: LiftTrend }) {
  const target = lift.target;
  const arrow =
    lift.direction === "up"
      ? "↑"
      : lift.direction === "down"
        ? "↓"
        : lift.direction === "flat"
          ? "→"
          : "·";
  const trendLabel = (() => {
    if (lift.deltaLb === null) return "first week tracked";
    if (lift.direction === "flat") return "flat vs 4-wk avg";
    const sign = lift.deltaLb > 0 ? "+" : "";
    return `${sign}${Math.round(lift.deltaLb)} lb vs 4-wk avg`;
  })();
  // Green = above the 4-wk average, orange = below, neutral = flat / new.
  const trendColor =
    lift.direction === "up"
      ? "#4ade80"
      : lift.direction === "down"
        ? "#fb923c"
        : "var(--fg-muted)";
  const toGo = target ? Math.max(0, Math.round(target.targetE1rm - lift.currentE1rm)) : 0;

  return (
    <div className="px-4 py-3.5 flex items-center gap-3.5">
      {target && <TargetRing pct={target.progressPct} />}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold truncate">{lift.name}</p>
        {target && (
          <p className="text-[12px] tabular-nums mt-0.5" style={{ color: "var(--fg)" }}>
            Goal {formatLoad(lift.name, target.targetWeight)} × {target.targetReps}
            <span style={{ color: "var(--fg-muted)" }}>
              {" · "}
              {toGo > 0 ? `${toGo} lb to go` : "reached"}
            </span>
          </p>
        )}
        <p className="text-[12px] tabular-nums mt-0.5" style={{ color: "var(--fg-muted)" }}>
          {lift.sessions === 0
            ? "No sessions logged yet"
            : `Now ${formatLoad(lift.name, lift.currentWeight)} × ${lift.currentReps} · ${relativeDate(lift.lastSessionAt)}`}
        </p>
      </div>
      <div className="text-right tabular-nums shrink-0">
        <p className="text-[18px] font-bold leading-none">
          {Math.round(lift.currentE1rm).toLocaleString()}
          <span className="text-[11px] font-normal ml-0.5" style={{ color: "var(--fg-muted)" }}>
            lb
          </span>
        </p>
        {target && (
          <p className="text-[11px] mt-1" style={{ color: "var(--fg-muted)" }}>
            of {formatLbs(target.targetE1rm)}
          </p>
        )}
        <p className="text-[11px] mt-0.5" style={{ color: trendColor }}>
          {arrow} {trendLabel}
        </p>
      </div>
    </div>
  );
}
