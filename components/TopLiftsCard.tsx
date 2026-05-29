"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteGoal } from "@/lib/actions/goals";
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
    <div className="mt-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[15px] font-bold tracking-tight">Strength</h2>
        <div className="flex items-center gap-4">
          {targets.length > 0 && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: editing ? "#f87171" : "var(--fg-dim)" }}
            >
              {editing ? "Done" : "Edit"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: adding ? "var(--fg-dim)" : "var(--accent)" }}
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
              border: "1px solid var(--border)",
            }}
          >
            <p className="text-[13px]" style={{ color: "var(--fg-dim)" }}>
              No targets yet. Tap{" "}
              <span style={{ color: "var(--accent)" }}>+ Add</span> to set a
              strength target and track your progress here.
            </p>
          </div>
        )
      ) : (
        <div
          className="rounded-2xl divide-y"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
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
    <div>
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

function LiftRowBody({ lift }: { lift: LiftTrend }) {
  const target = lift.target;
  const targetPct = target ? Math.min(1, target.progressPct) : 0;
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
      ? "var(--accent)"
      : lift.direction === "down"
        ? "#f97316"
        : "var(--fg-dim)";

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1 pr-3">
          <p className="text-[14px] font-medium truncate mb-0.5">{lift.name}</p>
          <p
            className="text-[11px] tabular-nums"
            style={{ color: "var(--fg-dim)" }}
          >
            {lift.sessions === 0
              ? "No sessions logged yet"
              : `${lift.currentWeight} × ${lift.currentReps} · ${relativeDate(lift.lastSessionAt)}`}
          </p>
        </div>
        <div className="text-right tabular-nums shrink-0 flex items-center gap-2">
          <div>
            <p className="text-[16px] font-bold">
              {formatLbs(lift.currentE1rm)}
            </p>
            <p className="text-[11px]" style={{ color: trendColor }}>
              {arrow} {trendLabel}
            </p>
          </div>
          <span style={{ color: "var(--fg-dim)" }}>→</span>
        </div>
      </div>

      {target && (
        <div className="mt-2.5">
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: "var(--bg-elevated)" }}
          >
            <div
              className="h-full transition-all"
              style={{
                width: `${Math.round(targetPct * 100)}%`,
                background: "var(--accent)",
              }}
            />
          </div>
          <div
            className="flex items-center justify-between mt-1 tabular-nums"
            style={{ color: "var(--fg-dim)" }}
          >
            <span className="text-[10px]">
              Goal {target.targetWeight} × {target.targetReps} ·{" "}
              {formatLbs(target.targetE1rm)}
            </span>
            <span
              className="text-[10px] font-semibold"
              style={{ color: "var(--accent)" }}
            >
              {Math.round(target.progressPct * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
