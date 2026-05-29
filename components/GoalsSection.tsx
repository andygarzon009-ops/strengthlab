"use client";

import { deleteGoal } from "@/lib/actions/goals";
import { PLATE_WEIGHT_LB } from "@/lib/exercises";
import { useState, useTransition } from "react";
import AddGoalForm from "@/components/AddGoalForm";

const PLATE_UNIT = "plates/side";
const PLATE_SINGLE_UNIT = "plates";
const LB_PER_PLATE_PAIR = PLATE_WEIGHT_LB * 2;

type Exercise = { id: string; name: string };

export type GoalWithProgress = {
  id: string;
  type: string;
  title: string;
  exerciseId: string | null;
  exerciseName: string | null;
  targetValue: number;
  targetReps: number | null;
  unit: string | null;
  deadline: string | null;
  currentValue: number;
  currentReps: number | null;
  progressPct: number;
};

export default function GoalsSection({
  goals,
  exercises,
}: {
  goals: GoalWithProgress[];
  exercises: Exercise[];
}) {
  const [adding, setAdding] = useState(false);

  const activeCount = goals.length;

  return (
    <div className="mb-6">
      <div className="flex items-end justify-between mb-4">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-[22px] font-bold tracking-tight leading-none">
            Targets
          </h2>
          {activeCount > 0 && (
            <p
              className="nums text-[12px] font-semibold"
              style={{
                color: "var(--fg-dim)",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              Chasing {activeCount}
            </p>
          )}
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="btn-ghost px-3 py-2 rounded-lg text-[12px] font-medium label"
        >
          {adding ? "Cancel" : "+ Add"}
        </button>
      </div>

      {adding && (
        <AddGoalForm exercises={exercises} onDone={() => setAdding(false)} />
      )}

      {goals.length === 0 ? (
        !adding && (
          <div
            className="card p-6 text-center"
            style={{
              border: "1px dashed var(--border-strong)",
              background: "transparent",
            }}
          >
            <p
              className="text-[13px] mb-2"
              style={{ color: "var(--fg-muted)" }}
            >
              No goals set yet
            </p>
            <p
              className="text-[11px]"
              style={{ color: "var(--fg-dim)" }}
            >
              Set a target — we&apos;ll track progress every session.
            </p>
          </div>
        )
      ) : (
        <div className="space-y-2.5">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function GoalCard({ goal }: { goal: GoalWithProgress }) {
  const [, startTransition] = useTransition();
  const [showDelete, setShowDelete] = useState(false);

  const pct = Math.min(100, Math.max(0, goal.progressPct));
  const complete = pct >= 100;
  const daysLeft = goal.deadline
    ? Math.ceil(
        (new Date(goal.deadline).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  return (
    <div
      className="card p-4"
      style={
        complete
          ? {
              borderColor: "rgba(34,197,94,0.4)",
              background:
                "linear-gradient(180deg, rgba(34,197,94,0.05) 0%, var(--bg-card) 100%)",
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <p
            className="label text-[9px] mb-1"
            style={{ color: "var(--fg-dim)" }}
          >
            {goalTypeLabel(goal.type)}
          </p>
          <h3 className="font-semibold text-[15px] tracking-tight truncate">
            {goal.title}
          </h3>
          {daysLeft !== null && (
            <p
              className="text-[11px] mt-0.5 nums"
              style={{
                color: daysLeft < 0 ? "#f87171" : "var(--fg-dim)",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              {daysLeft < 0
                ? `${Math.abs(daysLeft)}d past deadline`
                : daysLeft === 0
                  ? "Due today"
                  : `${daysLeft}d to go`}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowDelete(!showDelete)}
          className="text-[11px] label"
          style={{ color: "var(--fg-dim)" }}
        >
          {showDelete ? "Cancel" : "•••"}
        </button>
      </div>

      {/* Progress */}
      <div className="flex items-baseline justify-between mb-1.5">
        <span
          className="nums text-[22px] font-bold leading-none tracking-tight"
          style={{
            fontFamily: "var(--font-geist-mono)",
            color: complete ? "var(--accent)" : "var(--fg)",
          }}
        >
          {formatNumber(displayValue(goal.currentValue, goal.unit))}
          {unitSuffix(goal.unit) && (
            <span
              className="text-[12px] ml-0.5 font-normal"
              style={{ color: "var(--fg-dim)" }}
            >
              {unitSuffix(goal.unit)}
            </span>
          )}
          {goal.type === "STRENGTH" && (
            <span
              className="text-[13px] ml-1 font-normal"
              style={{ color: "var(--fg-dim)" }}
            >
              × {goal.currentReps ?? 1}
            </span>
          )}
          <span
            className="text-[12px] ml-1 font-normal"
            style={{ color: "var(--fg-dim)" }}
          >
            / {formatNumber(displayValue(goal.targetValue, goal.unit))}
            {unitSuffix(goal.unit) && (
              <span className="ml-0.5">{unitSuffix(goal.unit)}</span>
            )}
            {goal.type === "STRENGTH" && goal.targetReps != null && (
              <> × {goal.targetReps}</>
            )}
          </span>
        </span>
        <span
          className="nums text-[13px] font-semibold"
          style={{
            color: complete ? "var(--accent)" : "var(--fg-muted)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          {pct.toFixed(0)}%
        </span>
      </div>

      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: "var(--bg-elevated)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: complete
              ? "linear-gradient(90deg, var(--accent) 0%, var(--accent-hover) 100%)"
              : "var(--accent)",
          }}
        />
      </div>

      {complete && (
        <p
          className="label text-[10px] mt-2.5"
          style={{ color: "var(--accent)" }}
        >
          Goal reached — set a new one
        </p>
      )}

      {showDelete && (
        <div
          className="mt-3 pt-3 flex gap-2"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button
            onClick={() =>
              startTransition(async () => {
                await deleteGoal(goal.id);
                setShowDelete(false);
              })
            }
            className="flex-1 py-2 rounded-lg text-[12px] font-medium"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              color: "#f87171",
            }}
          >
            Delete goal
          </button>
        </div>
      )}
    </div>
  );
}

function goalTypeLabel(type: string): string {
  switch (type) {
    case "STRENGTH":
      return "Lift target";
    case "FREQUENCY":
      return "Frequency";
    case "BODYWEIGHT_GAIN":
    case "BODYWEIGHT_CUT":
      return "Body weight";
    case "DISTANCE":
      return "Distance";
    case "PACE":
      return "Pace";
    default:
      return type;
  }
}

function formatNumber(v: number): string {
  return Number.isInteger(v) || Math.abs(v - Math.round(v)) < 0.05
    ? Math.round(v).toString()
    : v.toFixed(1);
}

function unitSuffix(unit: string | null): string {
  if (!unit) return "";
  if (unit === "sessions/week") return "";
  if (unit === PLATE_UNIT) return "plates per side";
  if (unit === PLATE_SINGLE_UNIT) return "plates";
  return unit;
}

// Goals are always stored in their canonical unit (lb for weight, etc.).
// Plate-loaded lift goals divide back out for display so the user sees
// the same "plates" / "plates per side" count they entered.
function displayValue(value: number, unit: string | null): number {
  if (unit === PLATE_UNIT) return value / LB_PER_PLATE_PAIR;
  if (unit === PLATE_SINGLE_UNIT) return value / PLATE_WEIGHT_LB;
  return value;
}
